const { MessageEmbed } = require('discord.js');

module.exports = {
    run(client, interaction) {
        const url = 'https://media.discordapp.net/attachments/950684756171972618/957649740546310194/2_5460806898297082558.gif';

        const catEmbed = new MessageEmbed()
            .setTitle('owo')
            .setColor('#898576')
            .setImage(url)
            .setFooter({ text: 'nika.bot', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        interaction.reply({ embeds: [catEmbed] });
    },
    config: {
        name: 'catgif',
        description: 'Meh, i love that gif.'
    }
};