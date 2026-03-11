const DEFAULT_REDIRECT_TO = 'https://jccattenom.cantarero.fr/'

function parseArgs(argv) {
  const options = {
    email: '',
    redirectTo: process.env.REDIRECT_TO || DEFAULT_REDIRECT_TO,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--email') {
      options.email = argv[i + 1] || ''
      i += 1
    } else if (arg === '--redirect-to') {
      options.redirectTo = argv[i + 1] || ''
      i += 1
    } else if (arg === '-h' || arg === '--help') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function printHelp() {
  console.log(`Usage:\n  node scripts/invite-admin-user.mjs --email user@example.com [--redirect-to https://your-app.example/]\n\nEnvironment:\n  SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY\n\nBehavior:\n  - invites the user by e-mail through Supabase Auth\n  - then sets app_metadata.is_admin = true\n  - the invited user receives the Supabase invite email and can create a password\n`)
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || text || `HTTP ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.payload = data
    throw error
  }

  return data
}

async function listAllUsers() {
  const users = []
  let page = 1
  const perPage = 200

  while (true) {
    const data = await request(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`)
    const batch = data?.users || []
    users.push(...batch)

    if (batch.length < perPage) {
      break
    }

    page += 1
  }

  return users
}

async function findUserByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const users = await listAllUsers()
  return users.find((user) => String(user.email || '').trim().toLowerCase() === normalizedEmail) || null
}

async function updateAdminFlag(user, isAdmin) {
  const appMetadata = {
    ...(user?.app_metadata || {}),
    is_admin: isAdmin,
  }

  const updatedUser = await request(`/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    body: {
      app_metadata: appMetadata,
    },
  })

  return updatedUser
}

async function inviteUserByEmail(email, redirectTo) {
  return request('/auth/v1/invite', {
    method: 'POST',
    body: {
      email,
      data: {},
      redirect_to: redirectTo,
      redirectTo,
    },
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const email = String(options.email || '').trim().toLowerCase()
  const redirectTo = String(options.redirectTo || '').trim() || DEFAULT_REDIRECT_TO

  if (!email) {
    throw new Error('Missing required argument: --email')
  }

  let invitedUser = null
  let inviteSent = false

  try {
    const inviteResult = await inviteUserByEmail(email, redirectTo)
    invitedUser = inviteResult?.user || inviteResult?.data?.user || null
    inviteSent = true
  } catch (error) {
    const message = String(error?.message || error)
    if (/already registered|already been registered|user already/i.test(message)) {
      invitedUser = await findUserByEmail(email)
      if (!invitedUser) {
        throw new Error(`User appears to exist but could not be loaded again: ${email}`)
      }
      console.warn(`User already exists: ${email}. Admin flag will still be updated, but no fresh invite was sent.`)
    } else {
      throw error
    }
  }

  if (!invitedUser) {
    invitedUser = await findUserByEmail(email)
  }

  if (!invitedUser?.id) {
    throw new Error(`Unable to resolve invited user for ${email}`)
  }

  const updatedUser = await updateAdminFlag(invitedUser, true)

  console.log(JSON.stringify({
    success: true,
    email: updatedUser.email,
    userId: updatedUser.id,
    inviteSent,
    redirectTo,
    appMetadata: updatedUser.app_metadata || null,
  }, null, 2))
}

main().catch((error) => {
  console.error(error.message || String(error))
  process.exit(1)
})
