const {
  getDestination
} = require('@sap-cloud-sdk/connectivity');

(async () => {
  try {
    const destination = await getDestination({
      destinationName: 'IAS_SCIM'
    });

    console.log('DESTINATION RESULT:');
    console.log(destination);
  } catch (err) {
    console.error('DESTINATION ERROR:');
    console.error(err);
  }
})();