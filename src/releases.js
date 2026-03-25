const semver = require('semver')
const { fetchAllCommits } = require('./commits')

const MERGE_COMMIT_PATTERN = /^Merge (remote-tracking )?branch '.+'/
const COMMIT_MESSAGE_PATTERN = /\n+([\S\s]+)/

const parseReleases = async (tags, options, onParsed) => {
  const allCommits = await fetchAllCommits(options)
  const commitsByTag = partitionCommitsByTag(allCommits, tags)

  const releases = tags.map(tag => {
    const commits = commitsByTag.get(tag.tag) || []
    const merges = commits.filter(commit => commit.merge).map(commit => commit.merge)
    const fixes = commits.filter(commit => commit.fixes).map(commit => ({ fixes: commit.fixes, commit }))

    for (const plugin of options.plugins || []) {
      if (plugin.processCommits) plugin.processCommits(commits)
      if (plugin.processMerges) plugin.processMerges(merges)
      if (plugin.processFixes) plugin.processFixes(merges)
    }

    const emptyRelease = merges.length === 0 && fixes.length === 0
    const { message } = commits[0] || { message: null }
    const breakingCount = commits.filter(c => c.breaking).length
    const filteredCommits = commits
      .filter(filterCommits(merges))
      .sort(sortCommits(options))
      .slice(0, getCommitLimit(options, emptyRelease, breakingCount))

    if (onParsed) onParsed(tag)

    return {
      ...tag,
      summary: getSummary(message, options),
      commits: filteredCommits,
      merges,
      fixes
    }
  })

  for (const plugin of options.plugins || []) {
    if (plugin.processReleases) await plugin.processReleases(releases)
  }

  return releases.filter(filterReleases(options))
}

const partitionCommitsByTag = (allCommits, tags) => {
  // allCommits is in reverse chronological order (newest first)
  // tags is sorted newest-first: [unreleased?, v2.0.0, v1.0.0, ...]
  // Each tag has a .hash pointing to its commit (except synthetic unreleased/latest tags)

  const hashIndex = new Map(allCommits.map((c, i) => [c.hash, i]))
  const result = new Map()

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]
    const nextTag = tags[i + 1] // older tag (end boundary, exclusive)

    let startIdx, endIdx

    if (!tag.tag) {
      // Synthetic tag (unreleased / latest version) — commits from HEAD to newest real tag
      startIdx = 0
      endIdx = nextTag && nextTag.hash ? hashIndex.get(nextTag.hash) : allCommits.length
      if (endIdx === undefined) endIdx = allCommits.length
    } else if (!nextTag) {
      // Oldest tag — from this tag's commit to the end of history
      startIdx = tag.hash ? hashIndex.get(tag.hash) : 0
      if (startIdx === undefined) startIdx = 0
      endIdx = allCommits.length
    } else {
      // Normal tag — from this tag's commit (inclusive) to previous tag's commit (exclusive)
      startIdx = tag.hash ? hashIndex.get(tag.hash) : 0
      if (startIdx === undefined) startIdx = 0
      endIdx = nextTag.hash ? hashIndex.get(nextTag.hash) : allCommits.length
      if (endIdx === undefined) endIdx = allCommits.length
    }

    result.set(tag.tag, allCommits.slice(startIdx, endIdx))
  }

  return result
}

const filterCommits = merges => commit => {
  if (commit.fixes || commit.merge) {
    // Filter out commits that already appear in fix or merge lists
    return false
  }
  if (commit.breaking) {
    return true
  }
  if (semver.valid(commit.subject)) {
    // Filter out version commits
    return false
  }
  if (MERGE_COMMIT_PATTERN.test(commit.subject)) {
    // Filter out merge commits
    return false
  }
  if (merges.findIndex(m => m.message === commit.subject) !== -1) {
    // Filter out commits with the same message as an existing merge
    return false
  }
  return true
}

const sortCommits = ({ sortCommits }) => (a, b) => {
  if (!a.breaking && b.breaking) return 1
  if (a.breaking && !b.breaking) return -1
  if (sortCommits === 'date') return new Date(a.date) - new Date(b.date)
  if (sortCommits === 'date-desc') return new Date(b.date) - new Date(a.date)
  if (sortCommits === 'subject') return a.subject.localeCompare(b.subject)
  if (sortCommits === 'subject-desc') return b.subject.localeCompare(a.subject)
  return (b.insertions + b.deletions) - (a.insertions + a.deletions)
}

const getCommitLimit = ({ commitLimit, backfillLimit }, emptyRelease, breakingCount) => {
  if (commitLimit === false) {
    return undefined // Return all commits
  }
  const limit = emptyRelease ? backfillLimit : commitLimit
  return Math.max(breakingCount, limit)
}

const getSummary = (message, { releaseSummary }) => {
  if (!message || !releaseSummary) {
    return null
  }
  if (COMMIT_MESSAGE_PATTERN.test(message)) {
    return message.match(COMMIT_MESSAGE_PATTERN)[1]
  }
  return null
}

const filterReleases = options => ({ merges, fixes, commits }) => {
  if (options.hideEmptyReleases && (merges.length + fixes.length + commits.length) === 0) {
    return false
  }
  return true
}

module.exports = {
  parseReleases
}
