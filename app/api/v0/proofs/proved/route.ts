import { eq } from "drizzle-orm"
import { revalidateTag } from "next/cache"
import { ZodError } from "zod"

import { TAGS } from "@/lib/constants"

import { db } from "@/db"
import { clusters, programs, proofs } from "@/db/schema"
import { updateBlock } from "@/lib/api/blocks"
import { uploadProofBinary } from "@/lib/api/proof-binaries"
import { isStorageQuotaExceeded } from "@/lib/api/storage"
import { getTeam } from "@/lib/api/teams"
import { logger, traced } from "@/lib/logger"
import { withAuth } from "@/lib/middleware/with-auth"
import { provedProofSchema } from "@/lib/zod/schemas/proof"

// TODO:TEAM - refactor code to use baseProofHandler and abstract out the logic
export const POST = withAuth(async ({ request, user, timestamp }) => {
  const payload = await request.json()
  const teamId = user.id

  let proofPayload
  try {
    proofPayload = provedProofSchema.parse(payload)
  } catch (error) {
    logger.error("Proof payload validation failed", error, {
      team_id: teamId,
    })
    if (error instanceof ZodError) {
      return new Response(`Invalid request: ${error.message}`, {
        status: 400,
      })
    }

    return new Response("Invalid request", { status: 400 })
  }

  const { block_number, cluster_id, verifier_id, proof, ...restProofPayload } =
    proofPayload

  return traced(
    "POST /api/v0/proofs/proved",
    async () => {
      logger.info("Processing proved proof submission", {
        team_id: teamId,
        block_number,
        cluster_id,
        proof_size: proof.length,
      })

      // Get cluster uuid from cluster_id
      const cluster = await db.query.clusters.findFirst({
        columns: {
          id: true,
        },
        where: (clusters, { and, eq }) =>
          and(eq(clusters.index, cluster_id), eq(clusters.team_id, teamId)),
      })

      if (!cluster) {
        logger.error("Cluster not found", undefined, {
          cluster_id,
          team_id: teamId,
        })
        return new Response("Cluster not found", { status: 404 })
      }

      const clusterVersion = await db.query.clusterVersions.findFirst({
        columns: {
          id: true,
        },
        with: {
          cluster: true,
        },
        where: (clusterVersions, { eq }) =>
          eq(clusterVersions.cluster_id, cluster.id),
        orderBy: (clusterVersions, { desc }) => [
          desc(clusterVersions.created_at),
        ],
      })

      if (!clusterVersion) {
        logger.error("Cluster version not found", undefined, {
          cluster_id,
          team_id: teamId,
        })
        return new Response("Cluster version not found", { status: 404 })
      }

      try {
        const block = await updateBlock(block_number)
        logger.info("Block updated successfully", {
          block_number: block,
          team_id: teamId,
        })
      } catch (error) {
        logger.error("Failed to update block", error, {
          block_number,
          team_id: teamId,
        })
        return new Response("Internal server error", {
          status: 500,
        })
      }

      // TODO:TEAM - revisit this code, is it still needed?
      let programId: number | undefined
      if (verifier_id) {
        const existingProgram = await db.query.programs.findFirst({
          columns: {
            id: true,
          },
          where: (programs, { eq }) => eq(programs.verifier_id, verifier_id),
        })

        programId = existingProgram?.id

        if (!existingProgram) {
          try {
            const [program] = await db
              .insert(programs)
              .values({
                verifier_id,
              })
              .returning()

            programId = program?.id
          } catch (error) {
            logger.error("Failed to create program", error, { verifier_id })
          }
        }
      }

      const binaryBuffer = Buffer.from(proof, "base64")

      // TODO:TEAM - revisit the need for storage quota
      const storageQuotaExceeded = await isStorageQuotaExceeded(
        teamId,
        binaryBuffer.byteLength
      )

      if (storageQuotaExceeded) {
        logger.warn("Storage quota exceeded", {
          team_id: teamId,
          proof_size: binaryBuffer.byteLength,
        })
      }

      const dataToInsert = {
        ...restProofPayload,
        block_number,
        cluster_version_id: clusterVersion.id,
        program_id: programId,
        proof_status: "proved",
        proved_timestamp: timestamp,
        size_bytes: binaryBuffer.byteLength,
        team_id: teamId,
      }

      try {
        const newProof = await db.transaction(async (tx) => {
          const [newProof] = await tx
            .insert(proofs)
            .values(dataToInsert)
            .onConflictDoUpdate({
              target: [proofs.block_number, proofs.cluster_version_id],
              set: {
                ...dataToInsert,
              },
            })
            .returning({ proof_id: proofs.proof_id })

          // Handle active cluster status and updates
          if (!clusterVersion.cluster.is_active) {
            await tx
              .update(clusters)
              .set({
                is_active: true,
              })
              .where(eq(clusters.id, cluster.id))

            // Invalidate active clusters stats
            revalidateTag(TAGS.CLUSTERS)
            revalidateTag(TAGS.CLUSTER_SUMMARY)
          }

          if (!storageQuotaExceeded) {
            const team = await getTeam(teamId)
            const teamName = team?.name ? team.name : cluster.id.split("-")[0]
            const filename = `${block_number}_${teamName}_${newProof.proof_id}.txt`
            await uploadProofBinary(filename, binaryBuffer)
          }

          return newProof
        })

        revalidateTag(TAGS.PROOFS)
        revalidateTag(TAGS.BLOCKS)
        revalidateTag(`cluster-${cluster.id}`)
        revalidateTag(`block-${block_number}`)

        logger.info("Proof stored successfully", {
          proof_id: newProof.proof_id,
          block_number,
          team_id: teamId,
          cluster_id: cluster.id,
        })

        return Response.json(newProof)
      } catch (error) {
        logger.error("Failed to store proof", error, {
          block_number,
          team_id: teamId,
        })
        return new Response("Internal server error", {
          status: 500,
        })
      }
    },
    {
      block_number,
      team_id: teamId,
    }
  )
})
