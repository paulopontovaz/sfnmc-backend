const fs = require('fs');
const csv = require('csv-parser');

module.exports = {

  // Função que lê o arquivo 'airports.csv', filtra os dados
  // e armazena na lista 'locations'
  handleFile:async csv_file => {
    let locations = [];
    fs.createReadStream(csv_file)
      .pipe(csv())
      .on('data', (row) => {
        if (row.iata_code !== '') {
          const locationInfo = {
            country: row.iso_country,
            iataCode: row.iata_code,
            municipality: row.municipality
          };
          locations.push(locationInfo);
        }
      })
      .on('end', function () {
        console.log('loaded');
        console.log(locations);
        return locations;
      })
  }
}