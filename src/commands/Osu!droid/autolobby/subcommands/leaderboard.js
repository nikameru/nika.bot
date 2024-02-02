const { MessageEmbed } = require('discord.js');
const { getBeatmapInfoByHash } = require('../../../../utils/droidApi/droidApi');

const initializedLeaderboardEmbed = new MessageEmbed()
    .setColor('#99ec00')
    .setDescription('✅ **| Started watching room matches!**');

async function loadEmbedBeatmapInfo(embed, autolobby) {
    const res = await getBeatmapInfoByHash(autolobby.beatmap);

    if (!res[0]) {
        return console.log('~ [getRoomBeatmapInfo] beatmap not found!');
    }

    const roomBeatmapInfo = ''.concat(
        `- Song: ${res[0].artist} - **${res[0].title}**\n` +
        `- Difficulty: [*${res[0].version}*] (mapped by *${res[0].creator}*)\n` +
        `- Beatmap: [download](https://osu.ppy.sh/beatmaps/${res[0].beatmap_id})\n\n`
    );

    embed.setDescription(roomBeatmapInfo)
        .setThumbnail(`https://b.ppy.sh/thumb/${res[0].beatmapset_id}l.jpg`);
}

async function run(client, interaction, db, autolobby, isAutoleaderboard = false) {
    var leaderboardChannel;

    if (isAutoleaderboard) {
        leaderboardChannel = await client.channels.fetch('1202905240693641316');

        if (!autolobby.socket) return leaderboardChannel.send('No connection is present!');
    } else {
        leaderboardChannel = interaction.channel;

        if (!autolobby.socket) return leaderboardChannel.reply('No connection is present!');

        interaction.reply({ embeds: [initializedLeaderboardEmbed] });
    }

    const liveLeaderboardEmbed = new MessageEmbed()
        .setColor('#c7c9c5')
        .setDescription('💤 **| Waiting for a match to start...**');

    var isPlaying = false;

    await leaderboardChannel.send({ embeds: [liveLeaderboardEmbed] })
        .then((leaderboardMessage) => {
            var leaderboardScores = new Map();

            autolobby.socket.on('liveScoreData', (liveScoreData) => {
                if (!isPlaying) {
                    liveLeaderboardEmbed.setTitle('🟢 | Autolobby live leaderboard')
                        .setDescription('*Loading match info...*');

                    loadEmbedBeatmapInfo(liveLeaderboardEmbed, autolobby);

                    isPlaying = true;
                }

                for (let liveScore of liveScoreData) {
                    leaderboardScores.set(liveScore.username, liveScore);
                }

                var leaderboardScoreData = [], leaderboardEmbedFields = [];

                for (let leaderboardScore of leaderboardScores.values()) {
                    leaderboardScoreData.push(leaderboardScore);
                }

                leaderboardScoreData.sort((a, b) => b.score - a.score);

                for (let i = 0; i < leaderboardScoreData.length; i++) {
                    let score = leaderboardScoreData[i];

                    leaderboardEmbedFields.push({
                        name: `#${i + 1} ${score.username}`,
                        value:
                            `Score: **${score.score}** (${score.combo}x), ` +
                            `${(score.accuracy * 100).toFixed(2)}%`
                    });
                }

                liveLeaderboardEmbed.setFields(...leaderboardEmbedFields);

                leaderboardMessage.edit({ embeds: [liveLeaderboardEmbed] })
                    .catch(console.error);
            });

            const roomMatchEndListener = async (status) => {
                if (status != 0 || !isPlaying) return;

                isPlaying = false;

                await autolobby.socket.off('liveScoreData');
                await autolobby.socket.off('roomStatusChanged', roomMatchEndListener);

                const winnerFieldName = liveLeaderboardEmbed.fields[0].name;
                const winnerUsername = winnerFieldName.substring(winnerFieldName.indexOf(' '));

                liveLeaderboardEmbed.setTitle('🔴 | Autolobby match results')
                    .setDescription(
                        '🏁 **| Match has ended**\n' +
                        `Congrats to the winner, __**${winnerUsername}**__!\n\n` +
                        ':information_source: **| Match info:**\n' +
                        liveLeaderboardEmbed.description +
                        '🏆 **| Match results:**\n'
                    )
                    .setFooter({ 
                        text: 'from nikameru with 💜',
                        iconURL: await client.user.displayAvatarURL() 
                    })
                    .setTimestamp();

                await leaderboardMessage.edit({ embeds: [liveLeaderboardEmbed] })
                    .catch(console.error);
            }

            autolobby.socket.on('roomStatusChanged', roomMatchEndListener);
        });
}

const config = {
    name: 'leaderboard'
};

module.exports = { run, config };