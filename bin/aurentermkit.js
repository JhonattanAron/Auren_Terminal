#!/usr/bin/env node

const os = require('node:os');
const path = require('node:path');

process.env.AURENTERMKIT_CONFIG_DIR ||= path.join(os.homedir(), '.aurentermkit');
require('../src/cli.js');
