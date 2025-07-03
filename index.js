#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const chalk = require('chalk');
const ffmpegPath = require('ffmpeg-static');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

function ensureFfmpegIsAvailable() {
  if (fs.existsSync(ffmpegPath)) {
    return true;
  }

  console.log(chalk.yellow('FFmpeg binary not found. Attempting to download it now...'));
  console.log(chalk.yellow('This may take a moment.'));

  try {
    const ffmpegStaticDir = path.dirname(require.resolve('ffmpeg-static/package.json'));
    const installScript = path.join(ffmpegStaticDir, 'install.js');

    execFileSync('node', [installScript], { stdio: 'inherit' });

    console.log(chalk.green('FFmpeg downloaded successfully.'));
    return true;
  } catch (error) {
    console.error(chalk.red('Failed to download FFmpeg automatically.'), error);
    console.error(chalk.red('Please check your network connection or try installing FFmpeg manually.'));
    return false;
  }
}


const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [basename] [options]')
    .command('$0 [basename]', 'Converts files. If basename is provided, converts a specific set. Otherwise, scans the directory.', (yargs) => {
      yargs.positional('basename', {
        describe: 'The base name of the files to process (e.g., "song1" for "song1.flac")',
        type: 'string',
      });
    })
    .option('lang', {
      alias: 'l',
      describe: 'The 3-letter language code for the lyrics metadata',
      type: 'string',
      default: 'chi',
    })
    .help()
    .alias('help', 'h')
    .argv;

async function main() {
  const isFfmpegReady = ensureFfmpegIsAvailable();
  if (!isFfmpegReady) {
    process.exit(1);
  }

  const { basename, lang } = argv;
  const currentDir = process.cwd();

  if (basename) {
    console.log(chalk.cyan(`\nManual mode: Processing files for base name "${basename}"`));
    await processSingleFile(basename, lang, currentDir);
  } else {
    console.log(chalk.cyan(`\nAutomatic mode: Scanning for files in: ${currentDir}`));
    await processDirectory(lang, currentDir);
  }

  console.log(chalk.green.bold('\nDone.'));
}

async function processDirectory(lang, dir) {
  const allFiles = fs.readdirSync(dir);
  const flacFiles = allFiles.filter(file => path.extname(file).toLowerCase() === '.flac');

  if (flacFiles.length === 0) {
    console.log(chalk.yellow('No .flac files found in this directory.'));
    return;
  }

  for (const flacFile of flacFiles) {
    const baseName = path.basename(flacFile, path.extname(flacFile));
    await processSingleFile(baseName, lang, dir);
  }
}

async function processSingleFile(baseName, lang, dir) {
  const flacFile = path.join(dir, `${baseName}.flac`);
  const jpgFile = path.join(dir, `${baseName}.jpg`);
  const lycFile = path.join(dir, `${baseName}.lrc`);
  const outputFile = path.join(dir, `${baseName}.m4a`);

  if (fs.existsSync(flacFile) && fs.existsSync(jpgFile) && fs.existsSync(lycFile)) {
    console.log(chalk.blue(`Processing: ${path.basename(flacFile)}`));
    await runFfmpeg(flacFile, jpgFile, lycFile, outputFile, lang);
  } else {
    console.log(chalk.yellow(`Skipping: Could not find all required files for base name "${baseName}"`));
  }
}

function runFfmpeg(flacFile, jpgFile, lycFile, outputFile, lang) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', flacFile,
      '-i', jpgFile,
      '-i', lycFile,
      '-c:a', 'alac',
      '-c:v', 'copy',
      '-c:s', 'mov_text',
      '-map', '0:a',
      '-map', '1:v',
      '-map', '2:s',
      '-metadata:s:s:0', `language=${lang}`,
      '-disposition:v', 'attached_pic',
      '-y',
      outputFile
    ];

    const ffmpeg = spawn(ffmpegPath, args);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green(`Successfully created: ${path.basename(outputFile)}`));
        resolve();
      } else {
        console.error(chalk.red(`FFmpeg exited with code ${code} for ${path.basename(flacFile)}`));
        reject(new Error(`FFmpeg error`));
      }
    });

    ffmpeg.on('error', (err) => {
      console.error(chalk.red(`Failed to start FFmpeg for ${path.basename(flacFile)}`), err);
      reject(err);
    });
  });
}

main();