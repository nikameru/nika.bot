const { disconnectFromRoom } = require('../../../../utils/droidApi/droidApi.js');

async function run(client, interaction, db, autolobby) {
    if (await disconnectFromRoom()) {
        autolobby.socket = null;

        interaction.reply({ content: 'Disconnected' });
    } else {
        interaction.reply({ content: 'No connection is present!' });
    }
}

const config = {
    name: 'delete'
};

module.exports = { run, config };