const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageAttachment } = require('discord.js');
const petpetgif = require('pet-pet-gif');

module.exports = {
    async run(client, interaction) {
        const patMember = await interaction.options.getMentionable('user') || interaction.member;
        const patAvatar = await patMember.user.avatarURL({ format: 'jpg' });
        var patDescription;

        if (patMember == interaction.member) patDescription = `**${interaction.member.displayName} pats themselves!**`;
        else patDescription = `**${interaction.member.displayName} pats ${patMember}!**`;

        const gif = await petpetgif(patAvatar);
        const attachmentGif = new MessageAttachment(gif, 'pat.gif');

        const patEmbed = new MessageEmbed()
            .setDescription(patDescription)
            .setColor('#fcbef9')
            .setImage('attachment://pat.gif')
            .setFooter({ text: 'nika.bot', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        interaction.reply({ embeds: [patEmbed], files: [attachmentGif] });
    },
    config: new SlashCommandBuilder()
        .setName('pat')
        .setDescription('Pat someone! <3')
        .addMentionableOption(option => 
            option.setName('user')
                .setDescription('A user to pat. Defaults to yourself.')
                .setRequired(false)
        )
};