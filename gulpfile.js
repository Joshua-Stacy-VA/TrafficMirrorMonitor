'use strict';

const fs = require('fs-extra');
const path = require('path');
const {
    spawn,
    execSync
} = require('child_process');
const {
    src,
    dest,
    series
} = require('gulp');
const eslint = require('gulp-eslint');
const jest = require('gulp-jest').default;
const log = require('fancy-log');
const c = require('ansi-colors');

const ARTIFACT_DIR = 'artifacts';
const ESLINT_DIR = path.join(ARTIFACT_DIR, 'eslint');
const JEST_DIR = path.join(ARTIFACT_DIR, 'jest');

const BUILD_DIR = 'dist';
const BUILD_FILES = [
    './src/*.js',
    './config/*.json',
    'package.json',
    'LICENSE',
];

// ================================================= UTILITY FUNCTIONS =================================================
const getOptions = (defaults) => {
    const options = Object.assign({}, defaults);
    const args = process.argv.slice(3);

    const check = (value, option) => {
        if (value.includes(`--${option}`)) {
            options[option] = value.split('=')[1] || options[option];
        }
    };

    const keys = Object.keys(options);

    args.forEach((value) => {
        keys.forEach(option => check(value, option));
    });
    return options;
};

const info = msg => log.info(c.cyan(msg));
const warn = msg => log.warn(c.bold.yellow(msg));
const error = msg => log.error(c.bold.red(msg));

// ======================================================= TESTS =======================================================
const lint = () => {
    fs.removeSync(ESLINT_DIR);
    fs.ensureDirSync(ESLINT_DIR);
    const outputFile = `${ESLINT_DIR}/results.xml`;
    info(`ESLint results file: ${outputFile}`);
    return src('src/**/*.js')
        .pipe(eslint())
        .pipe(eslint.format('stylish'))
        .pipe(eslint.format('checkstyle', fs.createWriteStream(outputFile)))
        .pipe(eslint.failAfterError());
};

const test = () => {
    fs.removeSync(JEST_DIR);
    fs.ensureDirSync(JEST_DIR);
    return src('tests')
        .pipe(jest({
            verbose: true,
            collectCoverage: true,
            coverageDirectory: JEST_DIR,
            collectCoverageFrom: ['src/**', '!src/index.js'],
            coverageReporters: ['json', 'lcov'],
            coverageThreshold: {
                global: {
                    statements: 95,
                    branches: 95,
                    functions: 95,
                    lines: 95,
                },
            },
            reporters: ['default', 'jest-junit'],
        }));
};

// =================================================== PROJECT BUILD ===================================================
const clean = (done) => {
    fs.remove(BUILD_DIR, done);
};

const dist = () => {
    fs.ensureDirSync(BUILD_DIR);
    return src(BUILD_FILES, {
        base: '.'
    }).pipe(dest(BUILD_DIR));
};

Object.assign(exports, {
    clean,
    lint,
    test,
    build: series(clean, dist),
});