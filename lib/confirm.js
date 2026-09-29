const readline = require('readline');
const chalk = require('chalk');

// Yes/no prompt on Node's own readline. Replaces prompt-confirm, whose dependency chain
// (prompt-base > prompt-question > prompt-choices > toggle-array) carries an advisory with no fix,
// and which crashes on current Node once answered (ERR_USE_AFTER_CLOSE from rl.pause()).
//
// Answers match prompt-confirm's: Enter or y/yes/true (any case) proceed, anything else declines.
// Input that ends before an answer (closed or empty piped stdin) declines instead of proceeding.
module.exports = function confirm(question, streams) {
    const input = (streams && streams.input) || process.stdin;
    const output = (streams && streams.output) || process.stdout;

    return new Promise(resolve => {
        const rl = readline.createInterface({input, output});
        let answered = false;

        // readline swallows Ctrl-C while it owns the terminal; pass it on so it still aborts the run.
        rl.on('SIGINT', () => {
            answered = true;
            rl.close();
            output.write('\n');
            process.kill(process.pid, 'SIGINT');
        });

        rl.on('close', () => {
            if (!answered) {
                output.write('\n');
                resolve(false);
            }
        });

        rl.question(`${chalk.cyan('?')} ${chalk.bold(question)} ${chalk.dim('(Y/n)')} `, answer => {
            answered = true;
            rl.close();
            const text = answer.trim();
            resolve(text === '' || /^(y(es)?|true)$/i.test(text));
        });
    });
};
