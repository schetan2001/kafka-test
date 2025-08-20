// index.js
// This script acts as a dynamic transform connector by reading a full 'curl'
// command from an environment variable, parsing it, and executing the
// corresponding HTTP request. This approach provides a flexible, command-line
// driven way to interact with a REST API using only environment variables.

const axios = require('axios');
const util = require('util');

/**
 * Parses a simplified curl command string into a structured object
 * for an HTTP request. This function handles common flags like -X (method),
 * -H (header), -d (data), and the URL.
 * It's designed for single-execution scripts and doesn't support all curl features.
 * @param {string} curlString The curl command to parse.
 * @returns {object} An object containing the parsed request details: { method, url, headers, data }.
 */
function parseCurl(curlString) {
    const parts = curlString.split(' ').map(p => p.trim());
    let method = 'GET';
    let url = '';
    const headers = {};
    let data = null;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === '-X' && parts[i + 1]) {
            method = parts[i + 1].toUpperCase();
            i++;
        } else if (part === '-H' && parts[i + 1]) {
            const headerString = parts[i + 1].replace(/["']/g, ''); // Remove quotes
            const [key, value] = headerString.split(':');
            if (key && value) {
                headers[key.trim()] = value.trim();
            }
            i++;
        } else if (part === '-d' && parts[i + 1]) {
            try {
                // Assuming data is a JSON string
                data = JSON.parse(parts[i + 1].replace(/["']/g, ''));
            } catch (e) {
                console.error('Error parsing data JSON:', e.message);
                data = parts[i + 1];
            }
            i++;
        } else if (part.startsWith('http')) {
            url = part.replace(/["']/g, ''); // The URL is the first part that starts with http
        }
    }

    return { method, url, headers, data };
}

// Main execution function
async function main() {
    const curlCommand = process.env.CURL_COMMAND;

    if (!curlCommand) {
        console.error('Error: CURL_COMMAND environment variable is not set.');
        return;
    }

    try {
        // Parse the curl command from the environment variable.
        const requestOptions = parseCurl(curlCommand);

        if (!requestOptions.url) {
            console.error('Error: Could not find a valid URL in the CURL_COMMAND.');
            return;
        }

        // Use axios to make the HTTP request with the parsed options.
        const response = await axios({
            method: requestOptions.method,
            url: requestOptions.url,
            headers: requestOptions.headers,
            data: requestOptions.data,
        });

        // Log the full response data.
        // The util.inspect function provides a clean, formatted output of the JSON object.
        console.log(util.inspect(response.data, { showHidden: false, depth: null, colors: true }));
    } catch (error) {
        // Handle errors from the axios request.
        if (error.response) {
            console.error('API call failed with status:', error.response.status);
            console.error('Response data:', util.inspect(error.response.data, { showHidden: false, depth: null, colors: true }));
        } else {
            console.error('An unexpected error occurred:', error.message);
        }
        process.exit(1); // Exit with a non-zero code to indicate failure.
    }
}

// Execute the main function.
main();
