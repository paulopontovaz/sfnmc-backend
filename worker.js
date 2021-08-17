const WebSocket = require("ws");
let amqp = require("amqplib/callback_api");
const port = 5000;
const axios = require("axios").default;
const wss = new WebSocket.Server({ port });

let clientsWithCountries = [];

wss.on("connection", function connection(ws) {
	ws.on("error", console.error);

	ws.on("message", async (data) => {
		try {
			await axios({
				method: "get",
				url: "http://localhost:3333/countries",
				params: {
					iata: data.toString(),
				},
			}).then((response) => {
				const connectionIndex = clientsWithCountries.findIndex(
					(element) => {
						return element.connection == ws;
					}
				);

				if (connectionIndex < 0) {
					clientsWithCountries.push({
						connection: ws,
						countries: response.data,
					});
				} else {
					clientsWithCountries[connectionIndex].countries =
						response.data;
				}
			});
		} catch (e) {
			console.log(e);
		}
	});

	ws.on("close", (e) => {
		const connectionIndex = clientsWithCountries.findIndex((element) => {
			return element.connection == ws;
		});

		if (connectionIndex > -1) {
			clientsWithCountries.splice(connectionIndex, 1);
		}
	});
});

amqp.connect("amqp://localhost", (error0, connection) => {
	if (error0) {
		throw error0;
	}
	connection.createChannel((error1, channel) => {
		if (error1) {
			throw error1;
		}

		let queue = "travel_recommendation_queue";

		channel.assertQueue(queue, {
			durable: true,
		});

		console.log(
			" [*] Waiting for messages in %s. To exit press CTRL+C",
			queue
		);

		channel.consume(
			queue,
			(msg) => {
				const converter = new TextDecoder("utf-8");
				const convertedData = converter.decode(msg.content);
				const covidData = JSON.parse(convertedData);

				clientsWithCountries.forEach((client) => {
					if (client.connection.readyState === WebSocket.OPEN) {
						try {
							client.countries.forEach((country) => {
								country.cases =
									covidData[country.countryName].cases;
								country.contaminationRate =
									covidData[
										country.countryName
									].contaminationRate;
							});
						} catch (e) {
							console.log(e);
						}

						console.log(
							"client.countries.length",
							client.countries.length
						);

						const bufferedMessage = Buffer.from(
							JSON.stringify(client.countries)
						);

						client.connection.send(bufferedMessage);
					}
				});
			},
			{
				noAck: true,
			}
		);
	});
});
