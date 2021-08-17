const { AsyncResource } = require("async_hooks");
const { Dir } = require("fs");
const fs = require("fs");
const readline = require("readline");

/**
 * Returns a date of a few days ago with format MM/DD/YY
 * @param  {[Number]} days Number of past days
 * @return {[String]} Formatted date
 */
const getPastDate = (days) => {
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

/**
 * Returns a country's covid-19 contamination rate
 * @param  {[Number]} days Number of past days
 * @param  {[Array]} casesList List of a country's covid-19 cases
 * @return {[Number]} Covid19 contamination rate
 */
const calculateContaminationRate = (days, casesList) => {
  if (days == 90) {
    return 0;
  } else {
    const initial_value = casesList[getPastDate(days + 1)];
    const final_value = casesList[getPastDate(days)];
    const contamination_rate = (final_value - initial_value) / initial_value;
    return Math.round(contamination_rate * 10000) / 10000;
  }
};

/**
 * Returns an array of lines read from a csv file line by line
 * @async
 * @param  {[Dir]} path Number of past days
 * @param  {[Function]} lineCallback List of a country's covid-19 cases
 */
const processLineByLine = async (path, lineCallback) => {
  const fileStream = fs.createReadStream(path);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  rl.on("line", await lineCallback);
};

module.exports = { getPastDate, calculateContaminationRate, processLineByLine };
