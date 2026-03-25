const { randomBytes } = require('crypto')
const { parseCommit, MESSAGE_SEPARATOR } = require('../../src/commits.js')
const { getRemote } = require('../../src/remote.js')

const DEFAULT_REMOTE = getRemote('https://github.com/user/repo')

function generateCommit (data, options = {}, remote = DEFAULT_REMOTE, index = 0, hashes = null) {
  const {
    message,
    hash = (hashes && hashes[index]) || randomBytes(20).toString('hex'),
    date = '2000-01-01 00:00:00 +0000',
    ...extra
  } = typeof data === 'string' ? { message: data } : data
  const author = 'Example Author'
  const email = 'email@example.com'
  const string = `${hash}\n${date}\n${author}\n${email}\n${message}\n${MESSAGE_SEPARATOR}\n`
  return {
    ...parseCommit(string, remote, options),
    ...extra
  }
}

function generateCommits (array, options, remote, { hashes } = {}) {
  return array.map((data, i) => generateCommit(data, options, remote, i, hashes))
}

module.exports = {
  generateCommit,
  generateCommits
}
