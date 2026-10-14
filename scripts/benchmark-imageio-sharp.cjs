/* Same-input, fresh-process comparison; no disk thumbnail cache or libvips operation cache. */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const imageSize = require('image-size')

const root = path.resolve(__dirname, '..')
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const at = value.indexOf('='); return at < 0 ? [value.replace(/^--/, ''), true] : [value.slice(2, at), value.slice(at + 1)]
}))
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const now = () => Number(process.hrtime.bigint()) / 1e6

async function worker() {
  const files = JSON.parse(fs.readFileSync(args.manifest, 'utf8'))
  const edge = Number(args.edge), jobs = Number(args.jobs), threads = Number(args.threads)
  const started = now(), baselineRss = process.memoryUsage().rss
  let generate, engine, peakRss = baselineRss, lastTick = now(), maxGapMs = 0
  const timer = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss)
    const tick = now(); maxGapMs = Math.max(maxGapMs, tick - lastTick); lastTick = tick
  }, 5)
  timer.unref()
  const loadStart = now()
  if (args.backend === 'imageio') {
    generate = source => require(path.join(root, 'native/build/imageio.node')).generateThumbnail(source, edge, 78)
    // Load outside the first operation so both backends report initialization separately.
    require(path.join(root, 'native/build/imageio.node'))
    engine = 'ImageIO / Node-API 8'
  } else {
    const sharp = require('sharp')
    sharp.cache(false)
    if (threads) sharp.concurrency(threads)
    engine = { sharp: sharp.versions.sharp, vips: sharp.versions.vips, threads: sharp.concurrency() }
    const pipeline = require(path.join(root, 'native/sharp-thumbnail.cjs'))
    generate = source => pipeline.generateThumbnail(sharp, source, edge, 78)
  }
  const loadMs = now() - loadStart
  const firstStart = now()
  await generate(files[0])
  const firstMs = now() - firstStart
  const rounds = []
  for (let round = 0; round < 3; round++) {
    if (global.gc) global.gc()
    let cursor = 0
    const measurements = new Array(files.length), cpu = process.cpuUsage(), start = now()
    await Promise.all(Array.from({ length: jobs }, async () => {
      for (;;) {
        const index = cursor++
        if (index >= files.length) return
        const begin = now(), output = await generate(files[index]), dimensions = imageSize(output)
        if (!dimensions.width || !dimensions.height || Math.max(dimensions.width, dimensions.height) > edge) throw new Error('Invalid thumbnail dimensions')
        measurements[index] = { ms: now() - begin, bytes: output.length, width: dimensions.width, height: dimensions.height }
      }
    }))
    const wallMs = now() - start, used = process.cpuUsage(cpu)
    peakRss = Math.max(peakRss, process.memoryUsage().rss)
    rounds.push({ wallMs, cpuMs: (used.user + used.system) / 1000, measurements })
  }
  clearInterval(timer)
  const wallMs = median(rounds.map(round => round.wallMs))
  const result = { backend: args.backend, edge, jobs, threads, engine, loadMs, firstMs,
    firstTotalMs: loadMs + firstMs, totalProcessMs: now() - started, wallMs,
    throughput: files.length * 1000 / wallMs,
    averageCores: median(rounds.map(round => round.cpuMs / round.wallMs)),
    peakRssMiB: peakRss / 1024 / 1024, rssDeltaMiB: (peakRss - baselineRss) / 1024 / 1024,
    maxEventLoopGapMs: maxGapMs, rounds }
  process.stdout.write(JSON.stringify(result))
}

function runCase(config) {
  return new Promise((resolve, reject) => {
    const childArgs = ['--expose-gc', __filename, '--worker', `--manifest=${args.manifest}`,
      ...Object.entries(config).map(([key, value]) => `--${key}=${value}`)]
    // Match the Extension Host default, rather than pretending runtime code can resize its global pool.
    const child = spawn(process.execPath, childArgs, { cwd: root, env: { ...process.env, UV_THREADPOOL_SIZE: '4' } })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('exit', code => {
      if (code) reject(new Error(`${JSON.stringify(config)} failed: ${stderr}`))
      else { try { resolve(JSON.parse(stdout)) } catch (error) { reject(error) } }
    })
  })
}

async function main() {
  const files = JSON.parse(fs.readFileSync(args.manifest, 'utf8'))
  const report = { environment: { node: process.version, platform: process.platform, arch: process.arch,
    cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, ramGiB: os.totalmem() / 1024 ** 3,
    os: os.release(), uvPool: 4 }, files: files.map(file => ({ name: path.basename(file),
      bytes: fs.statSync(file).size, ...imageSize(file) })), cases: [] }
  for (const edge of [200, 400, 800]) {
    // Alternate the backend order across output sizes to reduce temporal bias.
    const modes = edge === 400 ? ['sharp', 'imageio'] : ['imageio', 'sharp']
    for (const backend of modes) {
      for (const threads of backend === 'sharp' ? [1, 4, 0] : [0]) {
        for (const jobs of [1, 2, 4, 8]) {
          const result = await runCase({ backend, edge, jobs, threads })
          report.cases.push(result)
          fs.writeFileSync(args.report, JSON.stringify(report, null, 2))
          console.log(`${backend} edge=${edge} jobs=${jobs} threads=${threads || 'default'}: ${result.wallMs.toFixed(1)}ms, ${result.throughput.toFixed(1)}/s, cores=${result.averageCores.toFixed(2)}, RSS=${result.peakRssMiB.toFixed(1)}MiB`)
        }
      }
    }
  }
}
(args.worker ? worker() : main()).catch(error => { console.error(error); process.exitCode = 1 })
