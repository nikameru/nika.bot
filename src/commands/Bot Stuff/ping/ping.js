const { MessageEmbed } = require('discord.js');

module.exports = {
    async run (client, interaction) {
        const latency = interaction.createdTimestamp - Date.now();
        const APILatency = Math.round(client.ws.ping);

        const pingingEmbed = new MessageEmbed()
            .setTitle('💭 | Pinging...')
            .setColor('ff8080');

        await interaction.reply({ embeds: [pingingEmbed] });

        const pingEmbed = new MessageEmbed()
            .setTitle('🏓 | Pong!')
            .setColor('ff8080')
            .setDescription(`Latency: ${latency}ms.\nAPI Latency: ${APILatency}ms.`)
            .setFooter('nika.bot', client.user.displayAvatarURL())
            .setTimestamp();

        await interaction.editReply({ embeds: [pingEmbed] });
    },
    config: {
        name: 'ping',
        description: 'Pong!'
    }
};