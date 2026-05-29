'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class Updater {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.deploymentType = null;
    }

    async detectDeploymentMethod() {
        if (this.deploymentType) return this.deploymentType;

        const deploymentTypeEnv = process.env.DEPLOYMENT_TYPE;
        if (deploymentTypeEnv && ['git', 'docker', 'systemd'].includes(deploymentTypeEnv)) {
            this.deploymentType = deploymentTypeEnv;
            return this.deploymentType;
        }

        if (fs.existsSync('/.dockerenv')) {
            this.deploymentType = 'docker';
            return this.deploymentType;
        }

        if (fs.existsSync('/etc/tdns-stats/config.yml')) {
            try {
                const result = await execAsync('systemctl is-active tdns-stats 2>/dev/null', { shell: '/bin/bash' });
                if (result.stdout.trim() === 'active') {
                    this.deploymentType = 'systemd';
                    return this.deploymentType;
                }
            } catch (e) {
            }
            this.deploymentType = 'docker';
            return this.deploymentType;
        }

        this.deploymentType = 'git';
        return this.deploymentType;
    }

    async executeUpdate() {
        const deploymentType = await this.detectDeploymentMethod();

        switch (deploymentType) {
            case 'docker':
                return this.updateDocker();
            case 'systemd':
                return this.updateSystemd();
            case 'git':
            default:
                return this.updateGit();
        }
    }

    async updateGit() {
        const cwd = this.projectRoot;
        console.log('[update] Fetching from remote');
        await execAsync('git fetch origin master', { cwd });
        console.log('[update] Resetting to remote master');
        const { stdout, stderr } = await execAsync('git reset --hard origin/master', { cwd });
        if (stderr) console.log('[update] git stderr:', stderr);
        console.log('[update] Update complete, process will restart');
        console.log('[update] stdout:', stdout);
        process.exit(0);
    }

    async updateDocker() {
        const cwd = this.projectRoot;
        console.log('[update] Executing docker-compose pull');
        await execAsync('docker-compose pull', { cwd });
        console.log('[update] Executing docker-compose up -d');
        await execAsync('docker-compose up -d', { cwd });
        console.log('[update] Update complete, container will be restarted');
    }

    async updateSystemd() {
        const cwd = this.projectRoot;
        console.log('[update] Executing git pull');
        const { stdout, stderr } = await execAsync('git pull', { cwd });
        if (stderr) console.log('[update] git pull stderr:', stderr);
        console.log('[update] Restarting systemd service');
        await execAsync('systemctl restart tdns-stats');
        console.log('[update] Service restart triggered');
    }
}

module.exports = Updater;
