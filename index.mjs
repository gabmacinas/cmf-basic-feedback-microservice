import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  // GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});

const dynamo = DynamoDBDocumentClient.from(client);

const tableName = process.env.TABLE_NAME;


function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

export const handler = async (event, context) => {
  console.log('request_event', event);
  const whitelist = process.env.API_CORS.split(',');
    const checkOrigin = () => {
      if (event.headers?.origin && whitelist.indexOf(event.headers.origin) !== -1) {
        return event.headers.origin;
      }
      if (event.headers?.Origin && whitelist.indexOf(event.headers.Origin) !== -1) {
        return event.headers.Origin;
      }
      return whitelist[0];
    };
  let body;
  let statusCode = 200;
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Origin': checkOrigin(),
    'Access-Control-Allow-Methods': 'PUT,GET'
  };

  try {
    switch (event.routeKey) {
      case "DELETE /submission/{id}":
        await dynamo.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              id: event.pathParameters.id,
            },
          })
        );
        body = `Deleted item ${event.pathParameters.id}`;
        break;
      case "GET /submissions/{id}":
        const params1 = {
          TableName: tableName,
          IndexName: 'source_ip-index',
          KeyConditionExpression: 'source_ip = :column_value',
          FilterExpression : 'source_ip = :source_ip',
          ExpressionAttributeValues : {':source_ip': event.requestContext.http.sourceIp}
        };
        body = await dynamo.send(
          new ScanCommand(params1)
        );
        body = body.Items;
        break;
      case "GET /submissions":
        if (event.headers.authorization !== 'Bearer unlocked') {
            body = {message:'Unauthorized'};
            statusCode = 403;
        } else {
            body = await dynamo.send(
          new ScanCommand({ TableName: tableName })
        );
        body = body.Items;
        }
        break;
      case "PUT /submission":
        if (event.headers.authorization === null) {
          body = {message:'Unauthorized'};
          statusCode = 403;
          break;
        }
        let currDate = new Date;
        const params = {
          TableName: tableName,
          IndexName: 'source_ip-index',
          KeyConditionExpression: 'source_ip = :column_value',
          FilterExpression : 'source_ip = :source_ip',
          ExpressionAttributeValues : {':source_ip': event.requestContext.http.sourceIp}
        };
        body = await dynamo.send(
          new ScanCommand(params)
        );
        const count = body.Items.length;
        if (count >= 5 && event.requestContext.http.sourceIp !== process.env.SOURCE_IP) {
          body = 'Rate Exceeded';
          statusCode = 400;
          break;
        }
        let requestJSON = JSON.parse(event.body);
        let tempId = makeid(32);
        await dynamo.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              id: tempId,
              discord_username: requestJSON.data[1],
              twitter_username: requestJSON.data[2],
              eth_address: requestJSON.data[3],
              tell_me: requestJSON.data[4],
              web3_stay: requestJSON.data[5],
              what_makes_mafioso: requestJSON.data[6],
              timestamp: currDate.toUTCString(),
              source_ip: event.requestContext.http.sourceIp
            },
          })
        );
        statusCode = 400;
        body = `Bad request`;
        break;
      default:
        throw new Error(`Unsupported route: "${event.routeKey}"`);
    }
  } catch (err) {
    statusCode = 400;
    body = err.message;
  } finally {
    body = JSON.stringify(body);
    console.log(event);
  }

  return {
    statusCode,
    body,
    headers,
  };
};
