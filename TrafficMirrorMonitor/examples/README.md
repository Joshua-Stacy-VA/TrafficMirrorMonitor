## Traffic Mirror Monitor - Example Scripts
The scripts in this document allow you to retrieve and download segments of stored traffic mirror data

### List Mirror Data Objects

This script will save the list of S3 mirror data objects saved on a given day and save the list to a text file,
with the following name scheme

`s3-objects_{{DAY START TIMESTAMP, IN EPOCH SECONDS}}-{{DAY END TIMESTAMP, IN EPOCH SECONDS}}.txt`

```
Usage:
  node list-mirror-data-objects.js [-b/--bucket] [-d/--startDate] [-z/--timezone] [-r/--region]

Options:
  -b --bucket     [required] Name of the AWS S3 bucket in which the mirrored data is stored
  -r --region     [optional, default 'us-gov-east-1'] Name of the AWS region in which the S3 bucket exists
  -d --startDate  [optional, default TODAY] The corresponding day of data to retrieve (must be M/D/YYYY format)
  -t --timezone   [optional, default 'America/Chicago'] IANA compatible timezone string
```

### Get Data Objects

This script will retrieve S3 objects from a list of objects stored in a file

```
Usage:
  node get-data-objects.js [-b/--bucket] [-d/--startDate] [-z/--timezone] [-r/--region]

Options:
  -b --bucket      [required] Name of the AWS S3 bucket in which the mirrored data is stored
  -s --sourceFile  [required] Text file containing a list of S3 object file names
  -r --region      [optional, default 'us-gov-east-1'] Name of the AWS region in which the S3 bucket exists
  -t --targetDir   [optional, default 'output'] Directory in which to save the S3 objects, created if it doesn't exist
  -c --concurrency [optional, default 5] Number of S3 object get operations that are run at the same time
```