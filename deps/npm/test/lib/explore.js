const t = require('tap')
const requireInject = require('require-inject')

let RPJ_ERROR = null
let RPJ_CALLED = ''
const mockRPJ = async path => {
  if (RPJ_ERROR) {
    try {
      throw RPJ_ERROR
    } finally {
      RPJ_ERROR = null
    }
  }
  RPJ_CALLED = path
  return {some: 'package'}
}

let RUN_SCRIPT_ERROR = null
let RUN_SCRIPT_EXIT_CODE = 0
let RUN_SCRIPT_SIGNAL = null
let RUN_SCRIPT_EXEC = null
const mockRunScript = ({ pkg, banner, path, event, stdio }) => {
  if (event !== '_explore')
    throw new Error('got wrong event name')

  RUN_SCRIPT_EXEC = pkg.scripts._explore

  if (RUN_SCRIPT_ERROR) {
    try {
      return Promise.reject(RUN_SCRIPT_ERROR)
    } finally {
      RUN_SCRIPT_ERROR = null
    }
  }

  if (RUN_SCRIPT_EXIT_CODE || RUN_SCRIPT_SIGNAL) {
    return Promise.reject(Object.assign(new Error('command failed'), {
      code: RUN_SCRIPT_EXIT_CODE,
      signal: RUN_SCRIPT_SIGNAL,
    }))
  }

  return Promise.resolve({ code: 0, signal: null })
}

const output = []
let ERROR_HANDLER_CALLED = null
const logs = []
const getExplore = windows => requireInject('../../lib/explore.js', {
  '../../lib/utils/is-windows.js': windows,
  path: require('path')[windows ? 'win32' : 'posix'],
  '../../lib/utils/error-handler.js': er => {
    ERROR_HANDLER_CALLED = er
  },
  'read-package-json-fast': mockRPJ,
  '../../lib/npm.js': {
    dir: windows ? 'c:\\npm\\dir' : '/npm/dir',
    log: {
      error: (...msg) => logs.push(msg),
      disableProgress: () => {},
      enableProgress: () => {},
    },
    flatOptions: {
      shell: 'shell-command',
    },
  },
  '@npmcli/run-script': mockRunScript,
  '../../lib/utils/output.js': out => {
    output.push(out)
  },
})

const windowsExplore = getExplore(true)
const posixExplore = getExplore(false)

t.test('basic interactive', t => {
  t.afterEach((cb) => {
    output.length = 0
    cb()
  })

  t.test('windows', t => windowsExplore(['pkg'], er => {
    if (er)
      throw er

    t.strictSame({
      ERROR_HANDLER_CALLED,
      RPJ_CALLED,
      RUN_SCRIPT_EXEC,
    }, {
      ERROR_HANDLER_CALLED: null,
      RPJ_CALLED: 'c:\\npm\\dir\\pkg\\package.json',
      RUN_SCRIPT_EXEC: 'shell-command',
    })
    t.strictSame(output, [
      "\nExploring c:\\npm\\dir\\pkg\nType 'exit' or ^D when finished\n",
    ])
  }))

  t.test('posix', t => posixExplore(['pkg'], er => {
    if (er)
      throw er

    t.strictSame({
      ERROR_HANDLER_CALLED,
      RPJ_CALLED,
      RUN_SCRIPT_EXEC,
    }, {
      ERROR_HANDLER_CALLED: null,
      RPJ_CALLED: '/npm/dir/pkg/package.json',
      RUN_SCRIPT_EXEC: 'shell-command',
    })
    t.strictSame(output, [
      "\nExploring /npm/dir/pkg\nType 'exit' or ^D when finished\n",
    ])
  }))

  t.end()
})

t.test('interactive tracks exit code', t => {
  const { exitCode } = process
  t.beforeEach((cb) => {
    process.exitCode = exitCode
    RUN_SCRIPT_EXIT_CODE = 99
    cb()
  })
  t.afterEach((cb) => {
    RUN_SCRIPT_EXIT_CODE = 0
    output.length = 0
    process.exitCode = exitCode
    cb()
  })

  t.test('windows', t => windowsExplore(['pkg'], er => {
    if (er)
      throw er

    t.strictSame({
      ERROR_HANDLER_CALLED,
      RPJ_CALLED,
      RUN_SCRIPT_EXEC,
    }, {
      ERROR_HANDLER_CALLED: null,
      RPJ_CALLED: 'c:\\npm\\dir\\pkg\\package.json',
      RUN_SCRIPT_EXEC: 'shell-command',
    })
    t.strictSame(output, [
      "\nExploring c:\\npm\\dir\\pkg\nType 'exit' or ^D when finished\n",
    ])
    t.equal(process.exitCode, 99)
  }))

  t.test('posix', t => posixExplore(['pkg'], er => {
    if (er)
      throw er

    t.strictSame({
      ERROR_HANDLER_CALLED,
      RPJ_CALLED,
      RUN_SCRIPT_EXEC,
    }, {
      ERROR_HANDLER_CALLED: null,
      RPJ_CALLED: '/npm/dir/pkg/package.json',
      RUN_SCRIPT_EXEC: 'shell-command',
    })
    t.strictSame(output, [
      "\nExploring /npm/dir/pkg\nType 'exit' or ^D when finished\n",
    ])
    t.equal(process.exitCode, 99)
  }))

  t.test('posix spawn fail', t => {
    RUN_SCRIPT_ERROR = Object.assign(new Error('glorb'), {
      code: 33,
    })
    return posixExplore(['pkg'], er => {
      t.match(er, { message: 'glorb', code: 33 })
      t.strictSame(output, [
        "\nExploring /npm/dir/pkg\nType 'exit' or ^D when finished\n",
      ])
      t.equal(process.exitCode, 33)
    })
  })

  t.test('posix spawn fail, 0 exit code', t => {
    RUN_SCRIPT_ERROR = Object.assign(new Error('glorb'), {
      code: 0,
    })
    return posixExplore(['pkg'], er => {
      t.match(er, { message: 'glorb', code: 0 })
      t.strictSame(output, [
        "\nExploring /npm/dir/pkg\nType 'exit' or ^D when finished\n",
      ])
      t.equal(process.exitCode, 1)
    })
  })

  t.test('posix spawn fail, no exit code', t => {
    RUN_SCRIPT_ERROR = Object.assign(new Error('command failed'), {
      code: 'EPROBLEM',
    })
    return posixExplore(['pkg'], er => {
      t.match(er, { message: 'command failed', code: 'EPROBLEM' })
      t.strictSame(output, [
        "\nExploring /npm/dir/pkg\nType 'exit' or ^D when finished\n",
      ])
      t.equal(process.exitCode, 1)
    })
  })

  t.end()
})

t.test('basic non-interactive', t => {
  t.afterEach((cb) => {
    output.length = 0
    cb()
  })

  t.test('windows', t => windowsExplore(['pkg', 'ls'], er => {
    if (er)
      throw er

    t.strictSame({
      ERROR_HANDLER_CALLED,
      RPJ_CALLED,
      RUN_SCRIPT_EXEC,
    }, {
      ERROR_HANDLER_CALLED: null,
      RPJ_CALLED: 'c:\\npm\\dir\\pkg\\package.json',
      RUN_SCRIPT_EXEC: 'ls',
    })
    t.strictSame(output, [])
  }))

  t.test('posix', t => posixExplore(['pkg', 'ls'], er => {
    if (er)
      throw er

    t.strictSame({
      ERROR_HANDLER_CALLED,
      RPJ_CALLED,
      RUN_SCRIPT_EXEC,
    }, {
      ERROR_HANDLER_CALLED: null,
      RPJ_CALLED: '/npm/dir/pkg/package.json',
      RUN_SCRIPT_EXEC: 'ls',
    })
    t.strictSame(output, [])
  }))

  t.end()
})

t.test('signal fails non-interactive', t => {
  const { exitCode } = process
  t.afterEach((cb) => {
    output.length = 0
    logs.length = 0
    cb()
  })

  t.beforeEach(cb => {
    RUN_SCRIPT_SIGNAL = 'SIGPROBLEM'
    RUN_SCRIPT_EXIT_CODE = null
    process.exitCode = exitCode
    cb()
  })
  t.afterEach(cb => {
    process.exitCode = exitCode
    cb()
  })

  t.test('windows', t => windowsExplore(['pkg', 'ls'], er => {
    t.match(er, {
      message: 'command failed',
      signal: 'SIGPROBLEM',
    })

    t.strictSame({
      RPJ_CALLED,
      RUN_SCRIPT_EXEC,
    }, {
      RPJ_CALLED: 'c:\\npm\\dir\\pkg\\package.json',
      RUN_SCRIPT_EXEC: 'ls',
    })
    t.strictSame(output, [])
  }))

  t.test('posix', t => posixExplore(['pkg', 'ls'], er => {
    t.match(er, {
      message: 'command failed',
      signal: 'SIGPROBLEM',
    })

    t.strictSame({
      RPJ_CALLED,
      RUN_SCRIPT_EXEC,
    }, {
      RPJ_CALLED: '/npm/dir/pkg/package.json',
      RUN_SCRIPT_EXEC: 'ls',
    })
    t.strictSame(output, [])
  }))

  t.end()
})

t.test('usage if no pkg provided', t => {
  t.teardown(() => {
    output.length = 0
    ERROR_HANDLER_CALLED = null
  })
  const noPkg = [
    [],
    ['foo/../..'],
    ['asdf/..'],
    ['.'],
    ['..'],
    ['../..'],
  ]
  t.plan(noPkg.length)
  for (const args of noPkg) {
    t.test(JSON.stringify(args), t => posixExplore(args, er => {
      t.equal(er, 'npm explore <pkg> [ -- <command>]')
      t.strictSame({
        ERROR_HANDLER_CALLED: null,
        RPJ_CALLED,
        RUN_SCRIPT_EXEC,
      }, {
        ERROR_HANDLER_CALLED: null,
        RPJ_CALLED: '/npm/dir/pkg/package.json',
        RUN_SCRIPT_EXEC: 'ls',
      })
    }))
  }
})

t.test('pkg not installed', t => {
  RPJ_ERROR = new Error('plurple')
  t.plan(2)

  posixExplore(['pkg', 'ls'], er => {
    if (er)
      throw er

    t.strictSame({
      ERROR_HANDLER_CALLED,
      RPJ_CALLED,
      RUN_SCRIPT_EXEC,
    }, {
      ERROR_HANDLER_CALLED: null,
      RPJ_CALLED: '/npm/dir/pkg/package.json',
      RUN_SCRIPT_EXEC: 'ls',
    })
    t.strictSame(output, [])
  }).catch(er => {
    t.match(er, { message: 'plurple' })
    t.match(logs, [['explore', `It doesn't look like pkg is installed.`]])
    logs.length = 0
  })
})
