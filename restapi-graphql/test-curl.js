(async () => {
  const curlconverter = await import('curlconverter');
  const curl = "curl --location 'https://cbp-eu-uat.royalenfield.com/vehicle-ops/metadata?pageNo=1&pageSize=10' \ --header 'accept: application/com.c2c.vehicle.operations.dto.vehicledataresponsedto+json' \ --header 'api-key: dmVoaWNsZS1hcGk' \ --header 'x-requestor: test'";
  console.log(curlconverter.toJsonObject(curl));
})();
