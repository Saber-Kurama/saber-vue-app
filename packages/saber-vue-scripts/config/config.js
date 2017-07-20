const paths = require('./paths')
const _ = require('lodash')
const fs = require('fs')

function getBlueConfig() {
    return fs.existsSync(paths.appConfig) ? require(paths.appConfig) : {}
}

let saberConfigDefaults = {
    build: {
        env:{
            NODE_ENV: '"production"'
        },
        assetsSubDirectory: 'static',
        assetsPublicPath: '/',
    }
    dev: {
        env: {
            NODE_ENV: '"development"'
        },
        port: 8080,
        proxyTable: {},
        assetsSubDirectory: 'static',
        assetsPublicPath: '/',
        cssSourceMap: false
    }
}

module.exports = _.merge({}, saberConfigDefaults, getBlueConfig())