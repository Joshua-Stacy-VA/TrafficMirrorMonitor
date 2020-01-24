# Traffic Mirror Monitor

Monitor, queue and store network traffic from an AWS VPC Traffic Mirrored source

## Table Of Contents

* [Background](#background)
* [Prerequisites](#prerequisites)
* [Installation](#installation)
* [Operation](#operation)
* [Artifacts](#artifacts)
* [Notes](#notes)

## Background

The **Traffic Mirror Monitor** is a NodeJS application that leverages the native AWS [VPC Traffic Mirroring]() to
capture RPC traffic between a targeted VISTA and the various clients that communicate with that VISTA via its RPC
Broker port. Thanks to the VPC Traffic Mirroring mechanism, The Traffic Mirror Monitor is fully passive and
non-intrusive, which implies that the operational risk introduced by having the **Traffic Mirror Monitor** running is
zero.

The **Traffic Mirror Monitor** will track individual TCP connections and streams, accumulate the raw data contained
within the TCP data packets, then save the data as JSON to an S3 bucket. See the [Artifacts](#artifacts) section below for
details on the S3 data object formats.

## Prerequisites

Because the main dependency of the **Traffic Mirror Monitor** is the AWS VPC Traffic Mirroring servides, this software
_must_ run in an AWS environment. You will need an AWS Account with enough privileges to create the following resources:
  - S3 Buckets
  - Network Load Balancers
  - Auto Scaling Groups
  - EC2 Instances
  - VPC Traffic Mirror Resources

One thing of note: the software relies on an open source NodeJS PCAP handler library, [node_pcap](https://github.com/node-pcap/node_pcap)
to handle raw packet decoding. If you are installing and operating the software manually, you will also need the appropriate
tools installed for your platform to build the native libraries that are included with the PCAP module.


## Installation

### Manually

First, you'll need to install the appropriate basic tools to support the retrieval and runtime the software:
```shell
> sudo yum -y install curl
> curl -sL https://rpm.nodesource.com/setup_10.x | sudo -E bash -
> sudo yum -y install nodejs git
```

As noted in the [Prerequisites](#prerequisites) section, the software depends on an open-source NodeJS PCAP library, which
compiles a native library. To get the appropriate tools installed on an Amazon Linux EC2 instance, this will typically
entail installing additional development tools as follows:

```shell
> sudo yum-config-manager --enable rhel-6-server-optional-rpms
> sudo yum -y install libpcap-devel
> sudo yum-config-manager --disable rhel-6-server-optional-rpms
> sudo yum install -y make glibc-devel gcc patch gcc-c++
```

Once you've done that, clone this repo and install the software:

```shell
> git clone https://github.com/vistadataproject/TrafficMirrorMonitor
> cd TrafficMirrorMonitor
> npm install
> npm run build
```

You'll also need to have a valid S3 bucket that the **Traffic Mirror Monitor** can write to.

### CloudFormation

For convenience, we've created a CloudFormation template for installing and running the **Traffic Mirror Monitor**.
The CloudFormation template installs the application within an Auto Scaling Group, behind a Network Load Balancer,
and also creates the target S3 bucket. To create the CloudFormation stack with the template, see the [deployment guide](https://github.com/vistadataproject/TrafficMirrorMonitor/wiki/Traffic-Mirror---AWS-Deployment-Procedure) here.


## Operation

To run the **Traffic Mirror Monitor** manually, use the following command:

```shell
> npm start
```

The application can recieve the following command line options:

```
-c <configuration file>: JSON configuration file (default: config/config.json)
```

### Configuration

The **Traffic Mirror Monitor** is configurable in several ways:

#### JSON Configuration File

The base configuration for the runtime comes from a JSON configuration file. The file has the following scheme:

| Name                  | Type          | Description                                                                               |
| --------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| capture               | Object        | Options related to the VPC Traffic Mirror packet capture.                                 |
| capture.port          | Number        | The UDP port that the app should listen to for mirrored traffic (default 4789)            |
| store                 | Object        | Options related to the mirrored data storage.                                             |
| store.type            | String        | Storage type: 's3' to save to an S3 bucket, 'local' to store local files (default 's3')   |
| store.options         | Object        | Storage options                                                                           |
| store.options.baseDir | String        | If 'store.type' is 'local', this value is used as the base directory for the file store.  |
| store.options.bucket  | String        |  If 'store.type' is 's3', this value is used as the S3 bucket name to store data objects  |
| store.options.region  | String        | If 'store.type' is 's3', this value is used as the AWS region (default 'us-gov-west-1')   |
| logging               | Array[Object] | Options related to logging.                                                               |
| logging.type          | String        | Logging type; supported options are: 'file', 'console' and 'cloudwatch'                   |
| logging.filename      | String        | If 'logging.type' is 'file', this is the file that the log messages is written to.        |
| logging.level         | String        | Logging level; supported options are 'error', 'warn', 'info', 'verbose', 'debug', 'silly' |

Note: 'cloudwatch' logging passes the configuration options directly to the constructor of the [winston-aws-cloudwatch](https://github.com/timdp/winston-aws-cloudwatch)
transport module. To configure 'cloudwatch' logging, refer to the configuration options therein.

##### Example

```
{
    "capture": {
        "port": 4789
    },
    "store": {
        "type": "s3",
        "options": {
            "bucket": "test-my-test",
            "region": "aws-gov-east-1"
        }
    },
    "logging": [{
        "type": "file",
        "filename": "logs/monitor.log",
        "level": "info"
    }, {
        "type": "console",
        "level": "verbose"
    }]
}
```


## Artifacts

Data objects processed by the function will be saved to the VAM S3 bucket with the following naming scheme:
`s3://{{S3 BUCKET NAME}}/{{PROCESS TIMESTAMP}}_{{SESSION UUID}}.json`

##### Example

`s3://traffic-mirror-vam-sample/15659901202123_a78b33d3-48c1-417e-ae78-abfc3456def4.json`

Each JS object will have the following format:

| Name                           | Type          | Description                                                                                                                                                     |
| ------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                             | String        | The UUID of the client/target connection session, assigned by the **Traffic Mirror Monitor**. All data associated with a unique connection will be tagged with the same id. |
| source                         | String        | Source of a given S3 JSON data object which will be either 'client' or 'target' depending on the direction of traffic                                           |
| client                         | String        | The hostname or IP address and TCP port of the RPC client entity with respect to the connection. The string will have the format `<host>:<port>`.               |
| target                         | String        | The hostname or IP address and TCP port of the target VISTA entity with respect to the connection. The string will have the format `<host>:<port>`.             |
| payload                        | Object        | Data and metadata from TCP stream captured by the mirror.                                                                                                                 |
| payload.client                 | Array[Object] | Client sourced data from the TCP stream.                                                                                                                            |
| payload.client.sequenceNumber  | String        | The sequence number, used by downstream applications, to order the data in the stream. This can be used to resequence the data from a particular stream.                        |
| payload.client.timestamp       | String        | Timestamp of the client data at the mirror.                                                                                                                            |
| payload.client.data            | String        | The converted ASCII version of the raw data. This is the data to use for reassembling the data stream.                                                          |
| payload.target                 | Array[Object] | Target sourced data from the TCP stream.                                                                                                                            |
| payload.target.sequenceNumber  | String        | The sequence number, used by downstream applications, to order the data in the stream. This can be used to resequence the data from a particular stream.                        |
| payload.target.timestamp       | String        | Timestamp of the server data at the mirror.                                                                                                                            |
| payload.target.data            | String        | The converted ASCII version of the raw data. This is the data to use for reassembling the data stream.                                                          |
| payload.control                | Array[Object] | Control data (connect/disconnect events) associated with the TCP stream.                                                                                               |
| payload.control.sequenceNumber | String        | The sequence number, used by downstream applications, to order the data in the stream. This can be used to resequence the data from a particular stream.                        |
| payload.control.timestamp      | String        | Timestamp of the control event at the mirror.                                                                                                                            |
| payload.control.data           | String        | String representing the type of control event.                                                          |

##### Example

```
{
  "id": "16cf24b5-08c5-4162-acc6-8cdcaa9ade90",
  "client": "10.184.59.41:49235",
  "target": "10.247.88.234:443",
  "payload": {
    "client": [
      {
        "sequenceNumber": "49598510572469704122697736725775930941507138114069463042",
        "timestamp": "000000000002",
        "data": "[XWB]10304\nTCPConnect5001210.184.59.41f00010f001210.184.59.41f\u0004"
      },
      {
        "sequenceNumber": "49598510572469704122697736730079706859335223542301065218",
        "timestamp": "000000000004",
        "data": "[XWB]11302\u00010\u0010XUS SIGNON SETUP50000f00011f\u0004"
      }
    ],
    "target": [
      {
        "sequenceNumber": "49598510572469704122697736725777139867326752743244169218",
        "timestamp": "000000000003",
        "data": "\u0000\u0000accept\u0004"
      },
      {
        "sequenceNumber": "49598510572469704122697736730109930004825589340388196354",
        "timestamp": "000000000005",
        "data": "\u0000\u0000gtm_sysid\r\nROU\r\nVAH\r\n/dev/null\r\n5\r\n0\r\nDEMO.NODEVISTA.ORG\r\n0\r\n\u0004"
      }
    ],
    "control": [
      {
        "sequenceNumber": "49598510572469704122697736725748125647656001574331744258",
        "timestamp": "000000000001",
        "data": "LINK_ESTABLISH"
      }
    ]
  }
}
```
