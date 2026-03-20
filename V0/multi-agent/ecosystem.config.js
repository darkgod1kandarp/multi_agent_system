module.exports = {
  apps: [{
    name: 'V0/multi-agent',
    script: 'main.js',        // Your entry file
    instances: 'max',          // Use all CPU cores
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};