const AWS = require('./aws-sdk');
const fs = require('fs');
const https = require('https');
const url = require('url');
const uuid = require('uuid/v4');

let hostname = '127.0.0.1';
let port = 9000;
let protocol = 'https';

let options = {  
    key: fs.readFileSync('./key.pem', 'utf8'),  
    cert: fs.readFileSync('./server.crt', 'utf8')  
};

const chime = new AWS.Chime({ region: 'us-east-1' });
chime.endpoint = new AWS.Endpoint('https://service.chime.aws.amazon.com/console');
const meetingCache = {};
const attendeeCache = {};

const log = message => {
  console.log(`${new Date().toISOString()} ${message}`);
};

const server = require(protocol).createServer(options, async (request, response) => {

  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Request-Method', '*');
  response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
  response.setHeader('Access-Control-Allow-Headers', '*');

  if (request.method === 'OPTIONS') {
    response.writeHead(200);
    response.end();
    return;
  }

  log(`${request.method} ${request.url} BEGIN`);
  try {
    if (request.method === 'GET' && request.url === '/') {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html');
      response.end(fs.readFileSync('index.html'));
    } else if (request.method === 'POST' && request.url.startsWith('/join')) {
      const query = url.parse(request.url, true).query;
      const title = query.title;
      const name = query.name;
      console.log("meeting title= " + title + ", display name " + name);
      if (!meetingCache[title]) {
        meetingCache[title] = await chime
          .createMeeting({
            ClientRequestToken: uuid(),
          })
          .promise();
        attendeeCache[title] = {};
      }
      const joinInfo = {
        JoinInfo: {
          Title: title,
          Meeting: meetingCache[title].Meeting,
          Attendee: (await chime
            .createAttendee({
              MeetingId: meetingCache[title].Meeting.MeetingId,
              ExternalUserId: uuid(),
            })
            .promise()).Attendee,
        },
      };
      attendeeCache[title][joinInfo.JoinInfo.Attendee.AttendeeId] = name;
      response.statusCode = 201;
      response.setHeader('Content-Type', 'application/json');
      response.write(JSON.stringify(joinInfo), 'utf8');
      response.end();
      log(JSON.stringify(joinInfo, null, 2));
    } else if (request.method === 'GET' && request.url.startsWith('/attendee?')) {
      const query = url.parse(request.url, true).query;
      const attendeeInfo = {
        AttendeeInfo: {
          AttendeeId: query.attendee,
          Name: attendeeCache[query.title][query.attendee],
        },
      };
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      response.write(JSON.stringify(attendeeInfo), 'utf8');
      response.end();
      log(JSON.stringify(attendeeInfo, null, 2));
    } else {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'text/plain');
      response.end('404 Not Found');
    }
  } catch (err) {
    log(`server caught error: ${err}`);
  }
  log(`${request.method} ${request.url} END`);
});

server.listen(port, hostname, () => {
  log(`server running at ${protocol}://${hostname}:${port}/`);
});
