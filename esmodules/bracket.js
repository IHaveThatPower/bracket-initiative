import {
	BracketInitiative
} from './bracket.class.js';

/**
 * On initialization, patch the actor document and the Combatant
 * prototype's initiative formula.
 */
Hooks.once("init", function() {
	// Hook our rollAll callback
	libWrapper.register(BracketInitiative.MODULE_NAME, 'Combat.prototype.rollAll', function(wrapped, ...args) {
		const result = wrapped(...args);
		BracketInitiative.rollAllInitiativeCallback();
		return result;
	}, 'WRAPPER');
	libWrapper.register(BracketInitiative.MODULE_NAME, 'Combat.prototype.rollNPC', function(wrapped, ...args) {
		const result = wrapped(...args);
		BracketInitiative.rollAllInitiativeCallback();
		return result;
	}, 'WRAPPER');

	// Hook the D20Roll modifier
	libWrapper.register(BracketInitiative.MODULE_NAME, 'CONFIG.Dice.D20Roll.prototype._onDialogSubmit', function(wrapped, html, advantageMode) {
		const roll = wrapped(html, advantageMode);
		return BracketInitiative.patchD20RollOnDialogSubmit(roll, html);
	}, 'WRAPPER');

	// Setup our debug property
	CONFIG.debug.BracketInitiative = false;
});

/**
 * When the game environment is ready, if a combat is already active,
 * turn on our socket.
 */
Hooks.once("ready", function() {
	if (!game.modules.get('lib-wrapper')?.active && game.user.isGM)
		ui.notifications.error("Module BracketInitiative requires the 'libWrapper' module. Please install and activate it.");

	if (game.combats.active)
	{
		BracketInitiative.log("Active combat detected; activating BracketInitiative socket");
		game.socket.on(BracketInitiative.SOCKET_NAME, BracketInitiative.handleUpdate);
	}
});

/**
 * When a combat is created, activate our socket!
 */
Hooks.on("createCombat", () => {
	BracketInitiative.log("New combat detected; activating BracketInitiative socket");
	game.socket.on(BracketInitiative.SOCKET_NAME, BracketInitiative.handleUpdate);
});

/**
 * Turn our socket off when combat ends.
 */
Hooks.on("deleteCombat", () => {
	BracketInitiative.log("Dectivating BracketInitiative socket");
	game.socket.off(BracketInitiative.SOCKET_NAME);
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
Hooks.on("updateCombatant", (combatant, update, diff, id) => {
	BracketInitiative.handleCombatantEvent(combatant, update);
});

Hooks.on("renderDialog", (dialog, $html, appData) => {
	BracketInitiative.enhanceInitiativeDialog(dialog, $html, appData);
});

Hooks.on("renderCombatTracker", (tracker, html, data) => {
	BracketInitiative.enhanceCombatTracker(html);
});