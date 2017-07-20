'use strict';

process.on('unhandledRejection', err => {
    throw err;
});

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const spawn = require('cross-spawn');

/**
 * appPath 项目app的路径
 * appName 项目app的名字
 * verbose 是否静默
 * originalDirectory saber-vue-app 的命令的目录
 * template 模板
 */
module.exports = function (
    appPath,
    appName,
    verbose,
    originalDirectory,
    template
) {
    const ownPackageName = require(path.join(__dirname, '..', 'package.json'))
        .name;
    const ownPath = path.join(appPath, 'node_modules', ownPackageName);
    const appPackage = require(path.join(appPath, 'package.json'));
    const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

    // Copy over some of the devDependencies
    appPackage.dependencies = appPackage.dependencies || {};

    // Setup the script rules
    // 添加 script
    appPackage.scripts = {
        start: 'saber-vue-scripts start',
        build: 'saber-vue-scripts build',
        test: 'saber-vue-scripts test --env=jsdom',
        eject: 'saber-vue-scripts eject',
    };

    fs.writeFileSync(
        path.join(appPath, 'package.json'),
        JSON.stringify(appPackage, null, 2)
    );

    // 如果存在 README.md
    const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
    if (readmeExists) {
        fs.renameSync(
            path.join(appPath, 'README.md'),
            path.join(appPath, 'README.old.md')
        );
    }

    // copy 模板
    const templatePath = template ?
        path.resolve(originalDirectory, template) :
        path.join(ownPath, 'template');

    // 如果模板文件存在    
    if (fs.existsSync(templatePath)) {
        fs.copySync(templatePath, appPath);
    } else {
        console.error(
            `Could not locate supplied template: ${chalk.green(templatePath)}`
        );
        return;
    }
    // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.move(
        path.join(appPath, 'gitignore'),
        path.join(appPath, '.gitignore'), [],
        err => {
            if (err) {
                // Append if there's already a `.gitignore` file there
                if (err.code === 'EEXIST') {
                    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
                    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
                    fs.unlinkSync(path.join(appPath, 'gitignore'));
                } else {
                    throw err;
                }
            }
        }
    );

    let command;
    let args;
    if (useYarn) {
        command = 'yarnpkg';
        args = ['add'];
    } else {
        command = 'npm';
        args = ['install', '--save', verbose && '--verbose'].filter(e => e);
    }
    args.push('react', 'react-dom');

    // Install additional template dependencies, if present
    const templateDependenciesPath = path.join(
        appPath,
        '.template.dependencies.json'
    );

    // 如果存在 .template.dependencies.json 文件
    if (fs.existsSync(templateDependenciesPath)) {
        const templateDependencies = require(templateDependenciesPath).dependencies;
        args = args.concat(
            Object.keys(templateDependencies).map(key => {
                return `${key}@${templateDependencies[key]}`;
            })
        );
        fs.unlinkSync(templateDependenciesPath);
    }

    // 如果 package.json 有 
    if (!isVueInstalled(appPackage) || template) {
        console.log(`Installing react and react-dom using ${command}...`);
        console.log();

        const proc = spawn.sync(command, args, {
            stdio: 'inherit'
        });
        if (proc.status !== 0) {
            console.error(`\`${command} ${args.join(' ')}\` failed`);
            return;
        }
    }

    // Display the most elegant way to cd.
    // This needs to handle an undefined originalDirectory for
    // backward compatibility with old global-cli's.
    let cdpath;
    if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
        cdpath = appName;
    } else {
        cdpath = appPath;
    }

    const displayedCommand = useYarn ? 'yarn' : 'npm';
    console.log();
    console.log(`Success! Created ${appName} at ${appPath}`);
    console.log('Inside that directory, you can run several commands:');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} start`));
    console.log('    Starts the development server.');
    console.log();
    console.log(
        chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`)
    );
    console.log('    Bundles the app into static files for production.');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} test`));
    console.log('    Starts the test runner.');
    console.log();
    console.log(
        chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`)
    );
    console.log(
        '    Removes this tool and copies build dependencies, configuration files'
    );
    console.log(
        '    and scripts into the app directory. If you do this, you can’t go back!'
    );
    console.log();
    console.log('We suggest that you begin by typing:');
    console.log();
    console.log(chalk.cyan('  cd'), cdpath);
    console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
    if (readmeExists) {
        console.log();
        console.log(
            chalk.yellow(
                'You had a `README.md` file, we renamed it to `README.old.md`'
            )
        );
    }
    console.log();
    console.log('Happy hacking!');

}

function isVueInstalled(appPackage) {
    const dependencies = appPackage.dependencies || {};

    return (
        typeof dependencies.vue !== 'undefined' 
    );
}
