# Child Logger Pattern

The `logger.child()` method creates a scoped logger with common context, making code more DRY without compromising readability.

## Before (Repetitive Context)

```typescript
export const POST = withAuth(async ({ request, user, timestamp }) => {
  const payload = await request.json()
  const teamId = user.id

  let proofPayload
  try {
    proofPayload = provedProofSchema.parse(payload)
  } catch (error) {
    logger.error("Proof payload validation failed", error, {
      team_id: teamId,  // ← repeated
    })
    return new Response("Invalid request", { status: 400 })
  }

  const { block_number, cluster_id, proof } = proofPayload

  return traced("POST /api/v0/proofs/proved", async () => {
    logger.info("Processing proved proof submission", {
      team_id: teamId,       // ← repeated
      block_number,          // ← repeated
      cluster_id,            // ← repeated
      proof_size: proof.length,
    })

    const cluster = await db.query.clusters.findFirst({...})

    if (!cluster) {
      logger.error("Cluster not found", undefined, {
        cluster_id,          // ← repeated
        team_id: teamId,     // ← repeated
      })
      return new Response("Cluster not found", { status: 404 })
    }

    const team = await getTeam(teamId)
    if (!team) {
      logger.error("Team not found", undefined, {
        team_id: teamId,     // ← repeated
      })
      return new Response("Team not found", { status: 404 })
    }

    logger.info("Proof binary uploaded", {
      team_id: teamId,       // ← repeated
      block_number,          // ← repeated
      filename,
    })

    logger.info("Proof record created", {
      team_id: teamId,       // ← repeated
      block_number,          // ← repeated
      proof_id: proofRecord.id,
    })
  }, {
    block_number,            // ← repeated in span attributes too
    team_id: teamId,         // ← repeated in span attributes too
  })
})
```

## After (DRY with Child Logger)

```typescript
export const POST = withAuth(async ({ request, user, timestamp }) => {
  const payload = await request.json()
  const teamId = user.id

  let proofPayload
  try {
    proofPayload = provedProofSchema.parse(payload)
  } catch (error) {
    logger.error("Proof payload validation failed", error, { team_id: teamId })
    return new Response("Invalid request", { status: 400 })
  }

  const { block_number, cluster_id, proof } = proofPayload

  // Create scoped logger with common context
  const log = logger.child({
    team_id: teamId,
    block_number,
    cluster_id,
  })

  return traced("POST /api/v0/proofs/proved", async () => {
    log.info("Processing proved proof submission", {
      proof_size: proof.length,  // ← only add unique context
    })

    const cluster = await db.query.clusters.findFirst({...})

    if (!cluster) {
      log.error("Cluster not found")  // ← team_id, cluster_id auto-included
      return new Response("Cluster not found", { status: 404 })
    }

    const team = await getTeam(teamId)
    if (!team) {
      log.error("Team not found")  // ← team_id auto-included
      return new Response("Team not found", { status: 404 })
    }

    log.info("Proof binary uploaded", { filename })  // ← team_id, block_number auto-included

    log.info("Proof record created", { proof_id: proofRecord.id })  // ← team_id, block_number auto-included
  }, {
    block_number,
    team_id: teamId,
  })
})
```

## Benefits

1. **Less repetition**: Common context defined once at the top
2. **Cleaner code**: Log calls focus on unique information
3. **Easy to maintain**: Change context in one place
4. **No compromise**: Still fully typed and readable
5. **Flexible**: Can create nested child loggers for different scopes

## Usage Pattern

```typescript
// 1. Parse/extract common context early
const { team_id, block_number, request_id } = await parseRequest()

// 2. Create child logger with common context
const log = logger.child({ team_id, block_number, request_id })

// 3. Use throughout function - only add unique context
log.info("Starting validation")
log.debug("Cache hit", { cache_key })
log.error("Database error", error)

// 4. Can create nested scopes if needed
const dbLog = log.child({ operation: "database" })
dbLog.info("Query started", { table: "proofs" })
```

## When to Use

✅ **Use child logger when:**
- 3+ log calls use the same context
- Context is available early (e.g., from parsed request)
- Function scope is clear (entire handler, traced block)

❌ **Don't use child logger when:**
- Only 1-2 log calls in a function
- Context changes frequently within the function
- Would make code less clear
