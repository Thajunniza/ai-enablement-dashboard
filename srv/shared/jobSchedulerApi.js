'use strict';

function getJobSchedulerCredentials() {
  const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
  for (const services of Object.values(vcap)) {
    for (const svc of services) {
      if (svc.label === 'jobscheduler' || (svc.name || '').includes('jobscheduler')) {
        return svc.credentials;
      }
    }
  }
  return null; // not bound - e.g. running locally under cds watch
}

async function getToken(creds) {
  const res = await fetch(`${creds.uaa.url}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${creds.uaa.clientid}:${creds.uaa.clientsecret}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error(`jobscheduler token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

module.exports = { getJobSchedulerCredentials, getToken };