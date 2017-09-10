console.log('Loading function');

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const MessageSender = require('./lib/MessageSender');
const lomadee = require('./lib/LomadeeHandler');
const Offer = require('./model/Offer');
const Message = require('./model/Message');

function verifyToken(parameters, callback) {
  let serverToken = parameters['hub.verify_token'];
  /* eslint-disable */
  let response = {
    body: null,
    statusCode: null,
  };
  /*eslint-enable */

  if (serverToken === VERIFY_TOKEN) {
    let challenge = parseInt(parameters['hub.challenge'], 10);
    [response.body, response.statusCode] = [challenge, 200];
  } else {
    [response.body, response.statusCode] = [
      'Error, wrong validation token',
      400,
    ];
  }

  callback(null, response);
}

function errorEvent(error) {
  console.warn(error);
}

function processMessages(evt, callback) {
  let data = JSON.parse(evt.body);

  if (data.object === 'page') {
    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach((entry) => {
      // Iterate over each messaging event
      entry.messaging.forEach((msg) => {
        if (msg.message) {
          let senderId = msg.sender.id;
          let messageText = msg.message.text;

          lomadee.searchByKeyword(messageText)
            .then((response) => {
              let searchData = response.data;

              console.log(`Lomadee search by ${messageText}`, searchData);
              let offers = searchData.offers
                .map((item) => {
                  // remove everything inside parentheses and insert Store name
                  let name = item.product.name || item.name;
                  let formattedName = name.replace(/\s*\(.*?\)\s*/g, '');
                  if (item.store && item.store.name) {
                    formattedName = `(${item.store.name}) ${formattedName}`;
                  }

                  let thumbnail = item.thumbnail;
                  if (item.product.thumbnail && item.product.thumbnail.url) {
                    thumbnail = item.product.thumbnail.url;
                  }

                  let price = `R$ ${item.price.toFixed(2).replace('.', ',')}`;
                  let link = item.link;

                  return new Offer(formattedName, price, thumbnail, link);
                });

              let preMessage = Message.SEARCH_RESULTS + Message.SEARCH_POS;
              MessageSender.sendTextMessage(senderId, preMessage)
                .catch(errorEvent);
              MessageSender.sendTemplateMessage(senderId, offers)
                .catch(errorEvent);
            })
            .catch((error) => {
              let preMessage = Message.SEARCH_NO_RESULTS + Message.SEARCH_POS;
              MessageSender.sendTextMessage(senderId, preMessage)
                .catch(errorEvent);
              console.warn(`Error at Lomadee search by ${messageText}`, error);
            });
        } else {
          console.error('Webhook received unknown event: ', evt);
        }
      });
    });
  }

  // Assume all went well
  const response = {
    body: 'ok',
    statusCode: 200,
  };

  callback(null, response);
}

exports.handler = (event, context, callback) => {
  let queryParameters = event.queryStringParameters;

  // GET/POST requests
  if (queryParameters) {
    verifyToken(queryParameters, callback);
  } else {
    processMessages(event, callback);
  }
};
