/* Shared by the deployed adapter, smoke checks and benchmark. */
exports.generateThumbnail = (sharp, source, edge, quality) => sharp(source, { sequentialRead: true, animated: false })
  .autoOrient()
  .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
  .flatten({ background: '#ffffff' })
  .jpeg({ quality, progressive: false, chromaSubsampling: '4:2:0' })
  .toBuffer()
