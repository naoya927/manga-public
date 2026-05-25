const { json, requireMethod, requirePassphrase } = require('./_lib');

module.exports = async function handler(req, res) {
    if (!requireMethod(req, res, 'GET')) {
        return;
    }

    if (!requirePassphrase(req, res)) {
        return;
    }

    json(res, 200, { status: 'success' });
};
