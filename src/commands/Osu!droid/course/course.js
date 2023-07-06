const { MessageEmbed } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRecentPlays } = require('../../../utils/droidApi/droidApi.js');

const uidNotFoundEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Please bind your droid account via __/droid userbind__ first!**'
    );

const courseClaimedEmbed = new MessageEmbed()
    .setColor('#ecec00')
    .setTitle('📖 | Skill Course system')

const courseNotClaimedEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Your recent plays don\'t include picked Skill Course map, or you haven\'t met specified conditions!**'
    );

async function run(client, interaction, db) {
    const courses = require('../../../data/skillCourses.json');
    const subcommandName = await interaction.options.getSubcommand();
    const courseOption = await interaction.options.getString('name');
    const desiredCourse = courses.courses[courseOption];
    const droidUsersCollection = await db.collection('droidUsersCollection');
    const droidUser = await droidUsersCollection.findOne({ userId: interaction.user.id });
 
    var droidId;

    if (droidUser != null) {
        droidId = droidUser.droidId;
    } else {
        return interaction.reply({ embeds: [uidNotFoundEmbed] });
    }

    var recentPlays;

    try {
        recentPlays = await getRecentPlays(droidId, 1, 10);
    } catch {
        return interaction.reply({ content: 'Error.', ephemeral: true });
    }

    for (play of recentPlays) {
        if (play.title != desiredCourse.title) {
            continue;
        } else if (parseFloat(play.accuracy).toFixed(0) < desiredCourse.condition || play.mods != 'No Mod') {
            continue;
        } else {
            await interaction.member.roles.add(desiredCourse.rewardRoleId);

            courseClaimedEmbed.setDescription(`✅ **| Congratulations!** You've passed __${desiredCourse.name}__!`)
                .setFooter({ text: 'from nikameru with 💜', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.reply({ embeds: [courseClaimedEmbed] });
        }
    }

    interaction.reply({ embeds: [courseNotClaimedEmbed] });
}

const config = new SlashCommandBuilder()
    .setName('course')
    .setDescription('Skill Course system commands.')
    .addSubcommand(subcommand =>
        subcommand.setName('claim')
            .setDescription('Claim completed Skill Course role!')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('Name of the Course.')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Aim Easy Skill Course', value: 'eaim' },
                        { name: 'Aim Easy Skill Course+', value: 'eaimplus' },
                        { name: 'Aim Death Skill Course', value: 'daim' },
                        { name: 'Aim Death Skill Course+', value: 'daimplus' }
                    )
            )
    );

module.exports = { run, config };