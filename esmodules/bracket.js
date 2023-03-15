import {
	BracketInitiative
} from './bracket.class.js';

Handlebars.registerHelper('json', function (obj)
{
	return JSON.stringify(obj);
});
Handlebars.registerHelper('numEq', function (a, b)
{
	return (Number.fromString(a) === Number.fromString(b));
});

/**
 * On initialization, patch the actor document and the Combatant
 * prototype's initiative formula.
 */
Hooks.once("init", function() {
	libWrapper.register(BracketInitiative.MODULE_NAME, 'Combat.prototype.rollAll', function(wrapped, ...args) {
		const result = wrapped(...args);
		BracketInitiative.rollInitiativeCallback();
		return result;
	}, 'WRAPPER');
	libWrapper.register(BracketInitiative.MODULE_NAME, 'Combat.prototype.rollNPC', function(wrapped, ...args) {
		const result = wrapped(...args);
		BracketInitiative.rollInitiativeCallback();
		return result;
	}, 'WRAPPER');
	libWrapper.register(BracketInitiative.MODULE_NAME, 'CONFIG.Dice.D20Roll.prototype._onDialogSubmit', function(wrapped, html, advantageMode) {
		const form = html[0].querySelector('form');
		const roll = wrapped(html, advantageMode);
		const manualInput = form.querySelector('input[name=manual]');
		if (manualInput)
		{
			const explicitRoll = Number(manualInput.value);
			if (explicitRoll && !isNaN(explicitRoll))
			{
				// Handle the first-term override
				roll.terms[0].results = [{active: true, result: Number(explicitRoll)}];
				roll.terms[0]._evaluated = true;
				
				// Represent it in the formula
				let formula = roll._formula;
				formula = formula.replace(/(1d20|2d20k.)/, explicitRoll);
				
				// Clean up "+ -" instances and update the formula
				formula = formula.replaceAll('+ -', '- ');
				roll._formula = formula;
			}
		}
		return roll;
	}, 'WRAPPER');
});

/**
 * When the game environment is ready, if a combat is already active,
 * turn on our socket.
 */
Hooks.once("ready", function() {
	if (!game.modules.get('lib-wrapper')?.active && game.user.isGM)
	{
		ui.notifications.error("Module BracketInitiative requires the 'libWrapper' module. Please install and activate it.");
	}
	if (game.combats.active)
	{
		console.log("BracketInitiative | Active combat detected; activating BracketInitiative socket");
		game.socket.on(BracketInitiative.SOCKET_NAME, BracketInitiative.handleUpdate);
	}
});

/**
 * When a combat is created, activate our socket!
 */
Hooks.on("createCombat", () => {
	console.log("BracketInitiative | New combat detected; activating BracketInitiative socket");
	game.socket.on(BracketInitiative.SOCKET_NAME, BracketInitiative.handleUpdate);
});

/**
 * Turn our socket off when combat ends.
 */
Hooks.on("deleteCombat", () => {
	console.log("BracketInitiative | Dectivating BracketInitiative socket");
	game.socket.off(BracketInitiative.SOCKET_NAME);
});

/**
 * When a user executes the Choose Round Action macro, fire off an event
 * so the class handles it
 */
Hooks.on('BracketInitiative_supplyInitiativeRoll', () => {
	return BracketInitiative.chooseRoundAction();
});

/**
 * When various combat events occur -- start, round advance, turn
 * advance, pass that data to our class for handling
 */
Hooks.on("combatStart", (combat, round) => {
	BracketInitiative.handleCombatEvent("start", combat, round);
});
Hooks.on("combatTurn", (combat, round, time) => {
	BracketInitiative.handleCombatEvent("turn", combat, round, time);
});
Hooks.on("combatRound", (combat, round, time) => {
	BracketInitiative.handleCombatEvent("round", combat, round, time);
});

Hooks.on("renderDialog", (dialog, $html, appData) => {
	BracketInitiative.enhanceInitiativeDialog(dialog, $html, appData);
});
/*
Hooks.on("preUpdateCombatant", (combatant, update, args, userId) => {
	return BracketInitiative.validateCanUpdate(combatant, update, args, userId);
});

Hooks.on("updateCombatant", (combatant, update, args, userId) => {
	return BracketInitiative.validateCanUpdate(combatant, update, args, userId);
});
*/