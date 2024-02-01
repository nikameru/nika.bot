const { MessageEmbed } = require('discord.js');

const initializedLeaderboardEmbed = new MessageEmbed()
    .setColor('#99ec00')
    .setDescription('✅ **| Started watching room matches!**');

const liveLeaderboardEmbed = new MessageEmbed()
    .setTitle('🏆 | Autolobby live leaderboard')
    .setColor('#e0e346');

async function run(client, interaction, db, autolobby) {
    // TODO

    if (!autolobby.socket) return interaction.reply('No connection is present!');

    await interaction.reply({ embeds: [initializedLeaderboardEmbed] });

    await interaction.channel.send({ embeds: [liveLeaderboardEmbed] })
        .then((leaderboardMessage) => {
            autolobby.socket.on('liveScoreData', (liveScoreData) => {
                var liveScoreFields = [];

                liveScoreData.sort((a, b) => b.score - a.score);

                for (let i = 0; i < liveScoreData.length; i++) {
                    let liveScore = liveScoreData[i];

                    liveScoreFields.push({
                        name: `#${i + 1} ${liveScore.username}`,
                        value:
                            `Score: **${liveScore.score}** (${liveScore.combo}x), ` +
                            `${(liveScore.accuracy * 100).toFixed(2)}%`
                    });
                }

                liveLeaderboardEmbed.setFields(...liveScoreFields);

                leaderboardMessage.edit({ embeds: [liveLeaderboardEmbed] })
                    .catch(console.error);
            });

            const roomMatchEndListener = (status) => {
                if (status != 0) return;

                interaction.channel.send('Match has ended.');

                autolobby.socket.off('liveScoreData');
                autolobby.socket.off('roomStatusChanged', roomMatchEndListener);
            }

            autolobby.socket.on('roomStatusChanged', roomMatchEndListener);
        });
}

const config = {
    name: 'leaderboard'
};

module.exports = { run, config };