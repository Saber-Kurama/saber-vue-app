'use strict';

const validateProjectName = require('validate-npm-package-name');
const chalk = require('chalk');
const commander = require('commander');
const fs = require('fs-extra');
const path = require('path');
const execSync = require('child_process').execSync;
const spawn = require('cross-spawn');
const semver = require('semver');
const dns = require('dns');
const tmp = require('tmp');
const unpack = require('tar-pack').unpack;
const hyperquest = require('hyperquest');

const packageJson = require('./package.json');

let projectName;

const program = new commander.Command(packageJson.name)
    .version(packageJson.version)
    .arguments('<project-directory>')
    .usage(`${chalk.green('<project-directory>')} [options]`)
    .action(name => {
        projectName = name;
    })
    .option('--verbose', 'print additional logs')
    .option(
        '--scripts-version <alternative-package>',
        'use a non-standard version of saber-vue-scripts'
    )
    .allowUnknownOption()
    .on('--help', () => {
        console.log(`    Only ${chalk.green('<project-directory>')} is required.`);
        console.log();
        console.log(
            `    A custom ${chalk.cyan('--scripts-version')} can be one of:`
        );
        console.log(`      - a specific npm version: ${chalk.green('0.0.1')}`);
        console.log(
            `      - a custom fork published on npm: ${chalk.green(
        'my-vue-scripts'
      )}`
        );
        console.log(
            `      - a .tgz archive: ${chalk.green(
        'https://mysite.com/my-vue-scripts-0.0.1.tgz'
      )}`
        );
        console.log(
            `    It is not needed unless you specifically want to use a fork.`
        );
        console.log();
    })
    .parse(process.argv);
if (typeof projectName === 'undefined') {
    console.error('Please specify the project directory:');
    console.log(
        `  ${chalk.cyan(program.name())} ${chalk.green('<project-directory>')}`
    );
    console.log();
    console.log('For example:');
    console.log(`  ${chalk.cyan(program.name())} ${chalk.green('my-vue-app')}`);
    console.log();
    console.log(
        `Run ${chalk.cyan(`${program.name()} --help`)} to see all options.`
    );
    process.exit(1);
}

function printValidationResults(results) {
    if (typeof results !== 'undefined') {
        results.forEach(error => {
            console.error(chalk.red(`  *  ${error}`));
        });
    }
}

const hiddenProgram = new commander.Command()
    .option(
        '--internal-testing-template <path-to-template>',
        '(internal usage only, DO NOT RELY ON THIS) ' +
        'use a non-standard application template'
    )
    .parse(process.argv);

createApp(
    projectName,
    program.verbose,
    program.scriptsVersion,
    hiddenProgram.internalTestingTemplate
);

function createApp(name, verbose, version, template) {
    const root = path.resolve(name);
    const appName = path.basename(root);

    checkAppName(appName);
    // 检查文件夹是否存在 不存在则创建
    fs.ensureDirSync(name);
    // 如果不是安全的创建工程
    if (!isSafeToCreateProjectIn(root)) {
        console.log(
            `The directory ${chalk.green(name)} contains files that could conflict.`
        );
        console.log('Try using a new directory name.');
        process.exit(1);
    }
    console.log(`Creating a new React app in ${chalk.green(root)}.`);
    console.log();

    // 定义 packageJson
    const packageJson = {
        name: appName,
        version: '0.1.0',
        private: true,
    };
    // 写packageJson    
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify(packageJson, null, 2)
    );

    // 返回运行当前脚本的工作目录的路径 即 saber-vue-app 执行的命令目录
    const originalDirectory = process.cwd();
    // 切换工作目录到指定目录
    process.chdir(root);

    // 是否使用 yarn
    const useYarn = shouldUseYarn();
    // todo 关于 npm 的版本小于 3.0.0 的话退出 

    // root 是项目目录 appName 项目名称 version saber-vue-scripts 的版本  
    // originalDirectory saber-vue-app 执行的命令目录 template 项目模板 useYarn 是否用yarn
    run(root, appName, version, verbose, originalDirectory, template, useYarn);
}

// 是否使用 yarn 
function shouldUseYarn() {
    try {
        execSync('yarnpkg --version', {
            stdio: 'ignore'
        });
        return true;
    } catch (e) {
        return false;
    }
}

// 安装依赖的项目
function install(useYarn, dependencies, verbose, isOnline) {
    return new Promise((resolve, reject) => {
        let command;
        let args;
        if (useYarn) {
            command = 'yarnpkg';
            args = ['add', '--exact'];
            if (!isOnline) {
                args.push('--offline');
            }
            [].push.apply(args, dependencies);

            if (!isOnline) {
                console.log(chalk.yellow('You appear to be offline.'));
                console.log(chalk.yellow('Falling back to the local Yarn cache.'));
                console.log();
            }
        } else {
            command = 'npm';
            args = [
                'install',
                '--save',
                '--save-exact',
                '--loglevel',
                'error',
            ].concat(dependencies);
        }

        if (verbose) {
            args.push('--verbose');
        }

        const child = spawn(command, args, {
            stdio: 'inherit'
        });
        child.on('close', code => {
            if (code !== 0) {
                reject({
                    command: `${command} ${args.join(' ')}`,
                });
                return;
            }
            resolve();
        });
    });
}


// 运行
function run(
    root,
    appName,
    version,
    verbose,
    originalDirectory,
    template,
    useYarn
) {
    // 获取 saber-vue-scripts 安装版本
    const packageToInstall = getInstallPackage(version);
    // 依赖包
    const allDependencies = ['vue', 'vue-router', packageToInstall];
    // 获取 saber-vue-scripts 这种类似项目的名称
    getPackageName(packageToInstall)
        .then(packageName =>
            checkIfOnline(useYarn).then(isOnline => ({
                isOnline: isOnline,
                packageName: packageName,
            }))
        )
        .then(info => {
            const isOnline = info.isOnline;
            const packageName = info.packageName;
            console.log(
                `Installing ${chalk.cyan('vue')}, and ${chalk.cyan(packageName)}...`
            );
            console.log();
            console.log('allDependencies', allDependencies)
            return install(useYarn, allDependencies, verbose, isOnline).then(
                () => packageName
            );
        })
        .then(packageName => {
            // 检查 saber-vue-scripts 中的node版本 和 本地node 版本比较 看是否支持
            // checkNodeVersion(packageName);
            // 对saber-vue-scripts中的 依赖包添加版本范围
            setCaretRangeForRuntimeDeps(packageName);

            const scriptsPath = path.resolve(
                process.cwd(),
                'node_modules',
                packageName,
                'scripts',
                'init.js'
            );
            const init = require(scriptsPath);
            console.log('originalDirectory', originalDirectory)
            console.log('template', template)
            // root 是项目目录 appName 项目名称 version saber-vue-scripts 的版本  
            // originalDirectory saber-vue-app 执行的命令目录 template 项目模板
            init(root, appName, verbose, originalDirectory, template);
        })
}

function getTemporaryDirectory() {
    return new Promise((resolve, reject) => {
        // Unsafe cleanup lets us recursively delete the directory if it contains
        // contents; by default it only allows removal if it's empty
        tmp.dir({
            unsafeCleanup: true
        }, (err, tmpdir, callback) => {
            if (err) {
                reject(err);
            } else {
                resolve({
                    tmpdir: tmpdir,
                    cleanup: () => {
                        try {
                            callback();
                        } catch (ignored) {
                            // Callback might throw and fail, since it's a temp directory the
                            // OS will clean it up eventually...
                        }
                    },
                });
            }
        });
    });
}

// 获取 react-scripts 的版本
// 如果 传递版本 的话  例如：1.0.1 返回 saber-vue-scripts@1.0.1
function getInstallPackage(version) {
    let packageToInstall = 'saber-vue-scripts';
    const validSemver = semver.valid(version);
    if (validSemver) {
        packageToInstall += `@${validSemver}`;
    } else if (version) {
        // for tar.gz or alternative paths
        packageToInstall = version;
    }
    return packageToInstall;
}
// 将流解压到临时目录中
function extractStream(stream, dest) {
    return new Promise((resolve, reject) => {
        stream.pipe(
            unpack(dest, err => {
                if (err) {
                    reject(err);
                } else {
                    resolve(dest);
                }
            })
        );
    });
}

// Extract package name from tarball url or path.
function getPackageName(installPackage) {
    // file:/saber/saber-vue-scripts-1.0.10.tgz 或者 https://mysite.com/my-vue-scripts-0.8.2.tgz
    if (installPackage.indexOf('.tgz') > -1) {
        // 创建临时目录
        return getTemporaryDirectory()
            .then(obj => {
                let stream;
                if (/^http/.test(installPackage)) {
                    // 处理文件为流失传输
                    stream = hyperquest(installPackage);
                } else {
                    // 读文件流
                    stream = fs.createReadStream(installPackage);
                }
                return extractStream(stream, obj.tmpdir).then(() => obj);
            })
            .then(obj => {
                // 得到文件名称
                const packageName = require(path.join(obj.tmpdir, 'package.json')).name;
                obj.cleanup();
                return packageName;
            })
            .catch(err => {
                // The package name could be with or without semver version, e.g. react-scripts-0.2.0-alpha.1.tgz
                // However, this function returns package name only without semver version.
                console.log(
                    `Could not extract the package name from the archive: ${err.message}`
                );
                const assumedProjectName = installPackage.match(
                    /^.+\/(.+?)(?:-\d+.+)?\.tgz$/
                )[1];
                console.log(
                    `Based on the filename, assuming it is "${chalk.cyan(
            assumedProjectName
          )}"`
                );
                return Promise.resolve(assumedProjectName);
            });
    } else if (installPackage.indexOf('git+') === 0) {
        // Pull package name out of git urls e.g:
        // git+https://github.com/mycompany/react-scripts.git
        // git+ssh://github.com/mycompany/react-scripts.git#v1.2.3
        return Promise.resolve(installPackage.match(/([^\/]+)\.git(#.*)?$/)[1]);
    } else if (installPackage.indexOf('@') > 0) {
        // Do not match @scope/ when stripping off @version or @tag
        return Promise.resolve(
            installPackage.charAt(0) + installPackage.substr(1).split('@')[0]
        );
    }
    return Promise.resolve(installPackage);
}

/**
 *  检查项目名称
 */
function checkAppName(appName) {
    const validationResult = validateProjectName(appName);
    if (!validationResult.validForNewPackages) {
        console.error(
            `Could not create a project called ${chalk.red(
        `"${appName}"`
      )} because of npm naming restrictions:`
        );
        printValidationResults(validationResult.errors);
        printValidationResults(validationResult.warnings);
        process.exit(1);
    }

    // TODO: there should be a single place that holds the dependencies
    // const dependencies = ['react', 'react-dom', 'react-scripts'].sort();
    // if (dependencies.indexOf(appName) >= 0) {
    //     console.error(
    //         chalk.red(
    //             `We cannot create a project called ${chalk.green(
    //       appName
    //     )} because a dependency with the same name exists.\n` +
    //             `Due to the way npm works, the following names are not allowed:\n\n`
    //         ) +
    //         chalk.cyan(dependencies.map(depName => `  ${depName}`).join('\n')) +
    //         chalk.red('\n\nPlease choose a different project name.')
    //     );
    //     process.exit(1);
    // }
}

function makeCaretRange(dependencies, name) {
  const version = dependencies[name];

  if (typeof version === 'undefined') {
    console.error(chalk.red(`Missing ${name} dependency in package.json`));
    process.exit(1);
  }

  let patchedVersion = `^${version}`;

  if (!semver.validRange(patchedVersion)) {
    console.error(
      `Unable to patch ${name} dependency version because version ${chalk.red(
        version
      )} will become invalid ${chalk.red(patchedVersion)}`
    );
    patchedVersion = version;
  }

  dependencies[name] = patchedVersion;
}
// 对依赖包 添加范围
function setCaretRangeForRuntimeDeps(packageName) {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = require(packagePath);

    if (typeof packageJson.dependencies === 'undefined') {
        console.error(chalk.red('Missing dependencies in package.json'));
        process.exit(1);
    }

    const packageVersion = packageJson.dependencies[packageName];
    if (typeof packageVersion === 'undefined') {
        console.error(chalk.red(`Unable to find ${packageName} in package.json`));
        process.exit(1);
    }

    makeCaretRange(packageJson.dependencies, 'vue');
    makeCaretRange(packageJson.dependencies, 'vue-router');

    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
}

// If project only contains files generated by GH, it’s safe.
// We also special case IJ-based products .idea because it integrates with CRA:
// https://github.com/facebookincubator/create-react-app/pull/368#issuecomment-243446094
function isSafeToCreateProjectIn(root) {
    const validFiles = [
        '.DS_Store',
        'Thumbs.db',
        '.git',
        '.gitignore',
        '.idea',
        'README.md',
        'LICENSE',
        'web.iml',
        '.hg',
        '.hgignore',
        '.hgcheck',
    ];
    return fs.readdirSync(root).every(file => validFiles.indexOf(file) >= 0);
}

// 检查线上
function checkIfOnline(useYarn) {
    if (!useYarn) {
        // Don't ping the Yarn registry.
        // We'll just assume the best case.
        return Promise.resolve(true);
    }

    return new Promise(resolve => {
        dns.lookup('registry.yarnpkg.com', err => {
            resolve(err === null);
        });
    });
}