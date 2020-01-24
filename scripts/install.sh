#!/usr/bin/env bash

exec &> >(tee deploy_installation.log)

echo '******************************************** RPC Mirror Installation *********************************************'
echo '---------------------------------------- Installing package repositories -----------------------------------------'
cd ~
curl -sL https://rpm.nodesource.com/setup_10.x | sudo -E bash -

echo '------------------------------------------------ Installing tools ------------------------------------------------'
yum -y install nodejs git
npm install pm2 -g
yum-config-manager --enable rhel-6-server-optional-rpms
yum -y install libpcap-devel
yum-config-manager --disable rhel-6-server-optional-rpms
yum install -y make glibc-devel gcc patch gcc-c++

echo '------------------------------ Installing and configuring process management tools -------------------------------'
npm config set strict-ssl false
runuser -l ec2-user -c 'pm2 install pm2-logrotate'

echo '---------------------------------------- Install the RPC Mirror software -----------------------------------------'
git config --global http.sslVerify false
git clone https://github.com/vistadataproject/TrafficMirrorMonitor
cd TrafficMirrorMonitor
npm install
npm run build

## This next line is specific to this particular deployment configuration
curl -sLk https://raw.githubusercontent.com/vistadataproject/TrafficMirrorMonitor/master/scripts/config.json -o dist/config/config.json
curl -sLk https://raw.githubusercontent.com/vistadataproject/TrafficMirrorMonitor/master/scripts/pm2-config.json -o dist/pm2-config.json
mv dist /usr/local/traffic-mirror

echo '------------------------------------------- Setup the software service -------------------------------------------'

cd /usr/local/traffic-mirror
npm install
chown -R ec2-user:ec2-user .

echo '-------------------------------------- Clean up the installation directory ---------------------------------------'
cd ~
rm -rf TrafficMirrorMonitor

echo '*************************************** RPC Mirror Installation Complete! ****************************************'
