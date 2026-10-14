//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const { validateTarget } = require('./scripts/vsix-targets.cjs')
const vsixTarget = process.env.IMAGE_VIEWER_VSIX_TARGET && validateTarget(process.env.IMAGE_VIEWER_VSIX_TARGET)
const includeImageIO = vsixTarget ? vsixTarget.startsWith('darwin-') : process.platform === 'darwin'
const includeSharp = vsixTarget ? !vsixTarget.startsWith('darwin-') : true

/**@type {import('webpack').Configuration}*/
const configExtension = {
  target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
  node: {
    __dirname: false,
    __filename: false
  },
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, './dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    // Drop stale artifacts (e.g. old `sql-wasm.wasm`) so `vsce package` never ships leftover files.
    clean: true
  },
  devtool: 'nosources-source-map',
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        // Vendor runtime files must remain byte-for-byte unchanged, including new ESM syntax.
        ...(includeSharp ? [{ from: 'native/build/sharp-runtime', to: 'native/sharp-runtime', info: { minimized: true } }] : []),
        ...(includeImageIO ? [{ from: 'native/build/imageio.node', to: 'native/imageio.node' }] : [])
      ]
    })
  ],
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        // exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};
module.exports = configExtension;
