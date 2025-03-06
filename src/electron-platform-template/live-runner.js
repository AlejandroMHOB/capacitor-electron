/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */

const childProcess = require('child_process');
const chokidar = require('chokidar');
const electron = require('electron');

let child = null;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const reloadWatcher = {
  debouncer: null,
  ready: false,
  watcher: null,
  restarting: false
};

function runBuild() {
  return new Promise((resolve, reject) => {
    let tempChild = childProcess.spawn(npmCmd, ['run', 'build'], {
      shell: true
    });

    tempChild.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    tempChild.stderr.on('data', (data) => {
      process.stderr.write(`Build error: ${data}`);
    });

    tempChild.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build process failed with code: ${code}`));
      }
    });

    tempChild.on('error', (err) => {
      reject(new Error(`Build process failed with error: ${err.message}`));
    });
  });
}

async function spawnElectron() {
  if (child !== null) {
    child.stdin.pause();
    child.kill();
    child = null;
    await runBuild();
  }

  child = childProcess.spawn(electron, ['--inspect=5858', '.'], {
    stdio: 'inherit',
    shell: true // Thats neccesary to run on windows
  });

  child.on('error', (err) => {
    console.error('Electron starting error:', err);
  });

  child.on('exit', (code) => {
    if (!reloadWatcher.restarting) {
      console.log(`Electron exited with code ${code}`);
      child = null;
      process.exit(0);
    }
  });

  // Redirect child process output to the main console
  // child.stdout.pipe(process.stdout);
}

function setupReloadWatcher() {
  reloadWatcher.watcher = chokidar
    .watch('./src/**/*', {
      ignored: /[/\\]\./,
      persistent: true
    })
    .on('ready', () => {
      reloadWatcher.ready = true;
    })
    .on('all', (_event, _path) => {
      if (reloadWatcher.ready) {
        clearTimeout(reloadWatcher.debouncer);
        reloadWatcher.debouncer = setTimeout(async () => {
          console.debug('Restarting...');
          reloadWatcher.restarting = true;
          await spawnElectron();
          reloadWatcher.restarting = false;
          reloadWatcher.ready = false;
          clearTimeout(reloadWatcher.debouncer);
          reloadWatcher.debouncer = null;
          reloadWatcher.watcher = null;
          setupReloadWatcher();
        }, 500);
      }
    });
}

(async () => {
  try {
    await runBuild();
    await spawnElectron();
    setupReloadWatcher();
  } catch (e) {
    console.error('Electron starting error:', e);
    process.exit(1);
  }
})();
