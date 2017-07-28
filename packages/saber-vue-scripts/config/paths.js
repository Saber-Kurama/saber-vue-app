'use strict';

const path = require('path');
const fs = require('fs');
const url = require('url');
const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = relativePath => path.resolve(appDirectory, relativePath);

module.exports = {
    appDirectory,
    appDist: resolveApp('dist'),
    appDistHTML: resolveApp('dist/index.html'),
    appDistStatic: resolveApp('dist/static'),
    appHTML: resolveApp('index.html'),
    appIndexJs: resolveApp('src/main.js'),
    appSrc: resolveApp('src'),
    appTest: resolveApp('test'),
    appConfig: resolveApp('saber.config.js'),
    appNodeModules: resolveApp('node_modules'),
    appAssents: resolveApp('src/assets'),
    appStatic: resolveApp('static'),
    appAssetsPublicPath: appDirectory,
}