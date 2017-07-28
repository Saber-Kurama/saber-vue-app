const paths = require('./paths')
const _ = require('lodash')
const fs = require('fs')

function getBlueConfig() {
    return fs.existsSync(paths.appConfig) ? require(paths.appConfig) : {}
}

let saberConfigDefaults = {
    build: {
        env: {
            NODE_ENV: '"production"'
        },
        assetsSubDirectory: 'static',
        assetsPublicPath: '/',
        productionSourceMap: true,
        // Gzip off by default as many popular static hosts such as
        // Surge or Netlify already gzip all static assets for you.
        // Before setting to `true`, make sure to:
        // npm install --save-dev compression-webpack-plugin
        productionGzip: false,
        productionGzipExtensions: ['js', 'css'],
        // Run the build command with an extra argument to
        // View the bundle analyzer report after build finishes:
        // `npm run build --report`
        // Set to `true` or `false` to always turn it on or off
        bundleAnalyzerReport: process.env.npm_config_report
    },
    dev: {
        env: {
            NODE_ENV: '"development"'
        },
        port: 8080,
        proxyTable: {},
        assetsSubDirectory: 'static',
        assetsPublicPath: '/',
        cssSourceMap: false
    },

}

module.exports = _.merge({}, saberConfigDefaults, getBlueConfig())