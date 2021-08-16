require("dotenv").config();

const envVariables = process.env;
const { AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET, PORT } = envVariables;

const express = require("express");
const cors = require("cors");
const amqp = require("amqplib/callback_api");
const Amadeus = require("amadeus");
const fs = require("fs");
const readline = require("readline");
const app = express();
const axios = require("axios").default;
const { raw } = require("express");

app.use(express.json());
app.use(cors());
app.listen(PORT, () => console.log("Server started at %s", PORT));

const covidApi = "https://corona.lmao.ninja/v2/historical";

//TIRAR VARIÁVEIS GLOBAIS
let cheapestFlightDestinations = [];
let locations = {};
let covidData = [];
let days = 90;

app.post("/", function (req, res) {
  const iata = req.body.iata_from;

  Main(iata);
  res.sendStatus(200);
});

const getDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  let formattedDate =
    date.getMonth() +
    1 +
    "/" +
    date.getDate() +
    "/" +
    date.getFullYear().toString().substr(-2);
  return formattedDate;
};

const getCovidHistoricalData = async (countriesName) => {
  if (!covidData.length) {
    await axios({
      method: "get",
      url: `${covidApi}/${countriesName}`,
      params: {
        lastdays: 90,
      },
    }).then(function (response) {
      covidData = response.data;
    });
  }

  covidData.forEach((countryObject, index) => {
    let cases_list = countryObject.timeline.cases;
    cheapestFlightDestinations[index].cases = cases_list[getDate(days)];
    cheapestFlightDestinations[index].contamination_rate =
      calculate_contamination_rate(days, cases_list);
    cheapestFlightDestinations[index].country_name = countryObject.country;
    cheapestFlightDestinations[
      index
    ].flag_link = `https://www.countryflags.io/${cheapestFlightDestinations[index].countryCode}/flat/64.png`;
  });

  days -= 1;
};

const amadeus = new Amadeus({
  clientId: AMADEUS_CLIENT_ID,
  clientSecret: AMADEUS_CLIENT_SECRET,
});

const calculate_contamination_rate = (days, cases_list) => {
  // Verificar se o dia anterior existe
  if (days == 90) {
    return 0;
  } else {
    const initial_value = cases_list[getDate(days + 1)];
    const final_value = cases_list[getDate(days)];
    const contamination_rate = (final_value - initial_value) / initial_value;

    return Math.round(contamination_rate * 10000) / 10000;
  }
};

const getCheapestFlightDestinations = async (iata) => {
  try {
    console.log("Making an api request...");

    const response = await amadeus.shopping.flightDestinations.get({
      origin: iata ?? "BSB",
    });

    const handledDestinations = await handleCheapestFlightDestinations(
      response
    );

    cheapestFlightDestinations = handledDestinations;
    console.log("The cheapest destinations array have been set!");
  } catch (err) {
    console.error(err);
  }
};

const handleCheapestFlightDestinations = (response) => {
  console.log("filtering the api response...");
  const { data, meta } = response.result;

  return data.map((item) => ({
    destinationIata: item.destination,
    price: item.price.total,
    currency: meta.currency,
  }));
};

const processLineByLine = async (path, lineCallback) => {
  const fileStream = fs.createReadStream(path);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  rl.on("line", await lineCallback);
};

const setDestinationCountryCode = () => {
  const rawFlightDestinations = cheapestFlightDestinations.map(
    (destination) => ({
      ...destination,
      countryCode: locations?.[destination.destinationIata]?.countryCode,
    })
  );

  let countriesCodes = [];
  let finalDestinationsList = [];

  rawFlightDestinations.forEach((destination) => {
    if (!countriesCodes.includes(destination.countryCode)) {
      countriesCodes.push(destination.countryCode);
      finalDestinationsList.push(destination);
    }
  });

  cheapestFlightDestinations = finalDestinationsList;
};

const sendRecommendationsToQueue = () => {
  cheapestFlightDestinations.forEach((destination) => {
    const bufferedMessage = Buffer.from(JSON.stringify(destination));
    queueRecommendation(bufferedMessage);
  });
};

const queueRecommendation = (msg) => {
  amqp.connect("amqp://localhost", function (error0, connection) {
    if (error0) {
      throw error0;
    }
    connection.createChannel(function (error1, channel) {
      if (error1) {
        throw error1;
      }

      let queue = "travel_recommendation_queue";

      channel.assertQueue(queue, {
        durable: true,
      });

      channel.sendToQueue(queue, Buffer.from(msg), {
        persistent: true,
      });
      console.log(" [x] Sent '%s' to '%s'", msg, queue);
    });

    setTimeout(function () {
      connection.close();
    }, 500);
  });
};

const sendFlightRecommendation = async (iata) => {
  await getCheapestFlightDestinations(iata);

  if (cheapestFlightDestinations.length && Object.keys(locations).length) {
    setDestinationCountryCode();
    const countriesIso = cheapestFlightDestinations
      .map((destination) => {
        return destination.countryCode;
      })
      .join(",");

    await getCovidHistoricalData(countriesIso);
    sendRecommendationsToQueue();
  }
};

const Main = async (iata) => {
  try {
    await processLineByLine("./airports.csv", (line) => {
      const [name, iso_country, municipality, iata_code] = line.split(",");
      if (iata_code) {
        locations[iata_code] = {
          countryCode: iso_country,
          municipality: municipality,
        };
      }
    });

    var interval = setInterval(async function () {
      await sendFlightRecommendation(iata);
    }, 15000);
  } catch (err) {
    console.error(err.statusCode);
  }
};
