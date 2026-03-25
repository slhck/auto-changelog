const { describe, it, afterEach } = require('mocha')
const { expect } = require('chai')
const remotes = require('./data/remotes')
const { generateCommits } = require('./utils/commits')
const {
  parseReleases,
  __Rewire__: mock,
  __ResetDependency__: unmock
} = require('../src/releases')

describe('parseReleases', () => {
  afterEach(() => {
    unmock('fetchAllCommits')
  })

  it('parses releases', async () => {
    const v2commits = generateCommits([
      'Merge pull request #4 from branch\n\nSixth commit',
      'Fifth commit\nFixes #3',
      'Fourth commit'
    ], {}, undefined, {
      hashes: ['hash_v2_1', 'hash_v2_2', 'hash_v2_3']
    })
    const v1commits = generateCommits([
      'Merge pull request #2 from branch\n\nThird commit',
      'Second commit\nFixes #1',
      'First commit'
    ], {}, undefined, {
      hashes: ['hash_v1_1', 'hash_v1_2', 'hash_v1_3']
    })
    // allCommits: newest first (v2 commits then v1 commits)
    mock('fetchAllCommits', () => Promise.resolve([...v2commits, ...v1commits]))
    const options = {
      commitLimit: 3,
      backfillLimit: 3,
      tagPrefix: '',
      latestVersion: null,
      ...remotes.github
    }
    const tags = [
      {
        tag: 'v2.0.0',
        date: '2000-01-01',
        diff: 'v1.0.0..v2.0.0',
        major: true,
        href: 'https://github.com/user/repo/compare/v1.0.0...v2.0.0',
        hash: 'hash_v2_1'
      },
      {
        tag: 'v1.0.0',
        date: '2000-01-01',
        diff: 'v1.0.0',
        major: false,
        href: null,
        hash: 'hash_v1_1'
      }
    ]
    const releases = await parseReleases(tags, options)
    expect(releases).to.be.an('array')
    expect(releases[0]).to.include({
      tag: 'v2.0.0',
      major: true,
      href: 'https://github.com/user/repo/compare/v1.0.0...v2.0.0'
    })
    expect(releases[0].commits).to.have.lengthOf(1)
    expect(releases[0].commits[0]).to.include({ subject: 'Fourth commit' })
    expect(releases[1]).to.include({
      tag: 'v1.0.0',
      major: false,
      href: null
    })
    expect(releases[1].commits).to.have.lengthOf(1)
    expect(releases[1].commits[0]).to.include({ subject: 'First commit' })
  })

  it('applies commitLimit', async () => {
    const commits = generateCommits(['Second commit', 'First commit\nFixes #1'], {}, undefined, {
      hashes: ['hash1', 'hash2']
    })
    mock('fetchAllCommits', () => Promise.resolve(commits))
    const options = { commitLimit: 1 }
    const tags = [{ tag: 'v1.0.0', date: '2000-01-01', diff: 'v1.0.0', hash: 'hash1' }]
    const releases = await parseReleases(tags, options)
    expect(releases[0].commits).to.have.lengthOf(1)
    expect(releases[0].commits[0]).to.include({ subject: 'Second commit' })
  })

  it('false commitLimit', async () => {
    const commits = generateCommits(['Fourth commit', 'Third commit', 'Second commit', 'First commit'], {}, undefined, {
      hashes: ['hash1', 'hash2', 'hash3', 'hash4']
    })
    mock('fetchAllCommits', () => Promise.resolve(commits))
    const options = { commitLimit: false }
    const tags = [{ tag: 'v1.0.0', date: '2000-01-01', diff: 'v1.0.0', hash: 'hash1' }]
    const releases = await parseReleases(tags, options)
    expect(releases[0].commits).to.have.lengthOf(4)
  })

  it('applies backfillLimit', async () => {
    const commits = generateCommits(['Second commit', 'First commit'], {}, undefined, {
      hashes: ['hash1', 'hash2']
    })
    mock('fetchAllCommits', () => Promise.resolve(commits))
    const options = { backfillLimit: 1 }
    const tags = [{ tag: 'v1.0.0', date: '2000-01-01', diff: 'v1.0.0', hash: 'hash1' }]
    const releases = await parseReleases(tags, options)
    expect(releases[0].commits).to.have.lengthOf(1)
    expect(releases[0].commits[0]).to.include({ subject: 'Second commit' })
  })

  it('includes breaking commits', async () => {
    const commits = generateCommits([
      { message: 'Second commit' },
      { message: 'First commit', breaking: true }
    ], {}, undefined, {
      hashes: ['hash1', 'hash2']
    })
    mock('fetchAllCommits', () => Promise.resolve(commits))
    const options = { commitLimit: 0, backfillLimit: 0 }
    const tags = [{ tag: 'v1.0.0', date: '2000-01-01', diff: 'v1.0.0', hash: 'hash1' }]
    const releases = await parseReleases(tags, options)
    expect(releases[0].commits).to.have.lengthOf(1)
    expect(releases[0].commits[0]).to.include({ subject: 'First commit' })
  })

  it('hides empty releases', async () => {
    mock('fetchAllCommits', () => Promise.resolve([]))
    const options = { hideEmptyReleases: true }
    const tags = [{ tag: 'v1.0.0', date: '2000-01-01', diff: 'v1.0.0', hash: 'hash1' }]
    const releases = await parseReleases(tags, options)
    expect(releases).to.have.lengthOf(0)
  })
})
