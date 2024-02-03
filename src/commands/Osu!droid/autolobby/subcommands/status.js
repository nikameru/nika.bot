const { MessageEmbed } = require('discord.js');
const { droidMultiInvite, getRooms } = require('../../../../utils/droidApi/droidApi.js');

const roomStatuses = ['Idle', 'Changing beatmap', 'Playing'];

async function run(client, interaction, db, autolobby) {
    var autolobbyRoom = null;

    const rooms = await getRooms();

    if (!rooms) return interaction.reply({ content: 'Failed to retrieve rooms list!' });

    for (let room of rooms) {
        let names = room.playerNames.split(', ');

        if (names.includes('nika_bot')) {
            autolobbyRoom = room;
            break;
        }
    }

    if (!autolobbyRoom) return interaction.reply({ content: 'No autolobby is present!' });

    const autolobbyInviteLink = droidMultiInvite + autolobbyRoom.id;

    const roomStatusEmbed = new MessageEmbed()
        .setTitle(`:information_source: | Autolobby status`)
        .setColor('#ff79b8')
        .setDescription(
            ` ⏩ **| Join:** ${autolobbyInviteLink}\n\n` +
            `- **Name:** ${autolobbyRoom.name}\n` +
            `- **ID:** ${autolobbyRoom.id}\n` +
            `- **Locked:** ${autolobbyRoom.isLocked}\n` +
            `- **Player limit:** ${autolobbyRoom.maxPlayers}\n` +
            `- **Players (${autolobbyRoom.playerCount}):** ${autolobbyRoom.playerNames}\n` +
            `- **Status:** ${roomStatuses[autolobbyRoom.status]}`
        )
        .setFooter({ text: 'from nikameru with 💜', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

    interaction.reply({ embeds: [roomStatusEmbed] });
}

const config = {
    name: 'status'
};

module.exports = { run, config };