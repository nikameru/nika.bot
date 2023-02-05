const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { MapInfo } = require('@rian8337/osu-base');
const { ReplayAnalyzer } = require('@rian8337/osu-droid-replay-analyzer');
const { readFile } = require('node:fs');

const mapNotFoundEmbed = new MessageEmbed()
    .setDescription('⛔ | Map not found!')
    .setColor('#ff4646');
const replayNotFoundEmbed = new MessageEmbed()
    .setDescription('⛔ | Replay not found!')
    .setColor('#ff4646');

module.exports = {
    async run(client, interaction) {
        const beatmapData = await MapInfo.getInformation({ beatmapID: interaction.options.getInteger('map') });
        const score = interaction.options.getInteger('score') || 0;
        const replayFile = interaction.option.getAttachment('replay') || null;
        const checkingOption = interaction.option.getString('check') || 'all';

        if (!beatmapData.title) {
            return interaction.reply({ embeds: [mapNotFoundEmbed] });
        }

        const replay = new ReplayAnalyzer({
            scoreID: score,
            map: beatmapData.map
        });

        if (score == 0) {
            readFile(replayFile, (err, replayData) => {
                if (err) console.log(err);

                replay.originalODR = replayData;
            });
        }

        await replay.analyze();

        const { replayData } = replay;

        if (!replayData) {
            return interaction.reply({ embeds: [replayNotFoundEmbed] });
        }

        const stats = new MapStats({
            ar: data.forcedAR,
            speedMultiplier: data.speedModification,
            isForceAR: !isNaN(data.forcedAR),
            oldStatistics: data.replayVersion <= 3,
        });

        replay.map = new DroidStarRating().calculate({
            map: beatmapInfo.map,
            mods: data.convertedMods,
            stats: stats,
        });

        switch (checkingOption) {
            case '2h':
                console.log('2h ' + replay.checkFor2Hand());
                break;
            case '3f':
                console.log('3f ' + replay.checkFor3Finger());
                break;
            case 'all':
                console.log('2h ' + replay.checkFor2Hand());
                console.log('3f ' + replay.checkFor3Finger());
        }
    },
    config: new SlashCommandBuilder()
        .setName('checkreplay')
        .setDescription('Checks the replay for the presence of playing with 2h or 3f.')
        .addIntegerOption(option =>
            option.setName('map')
                .setDescription('ID of a map.')
                .setRequired(true)
        ).addIntegerOption(option =>
            option.setName('score')
                .setDescription('ID of a score to check. Defaults to none (but you need to attach an .odr file then).')
        ).addAttachmentOption(option =>
            option.setName('replay')
                .setDescription('A replay to check (.odr file).')
        ).addStringOption(option =>
            option.setName('check')
                .setDescription('What should I check? Defaults to all.')
                .addChoices(
                    { name: 'Playing with 2 hands', value: '2h' },
                    { name: 'Streaming with 3 fingers', value: '3f' },
                    { name: 'Both options', value: 'all' }
                )
        )
};