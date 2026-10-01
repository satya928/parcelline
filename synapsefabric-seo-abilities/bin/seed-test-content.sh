#!/usr/bin/env bash
# Seeds the wp-env *development* site with sample posts (two near-duplicates, two unrelated).
# Runs only inside wp-env; never point this at a live site.
set -euo pipefail

WP="npx wp-env run cli wp"
if [ "$($WP post list --post_type=post --name=sfsa-seed-a --format=count)" != "0" ]; then
	echo "Seed content already present."
	exit 0
fi

BASE="WordPress caching speeds up your site by storing rendered pages so the server does not rebuild them on every request. Page caching, object caching and browser caching each help in a different way, and most hosts support at least one of them out of the box."
$WP post create --post_status=publish --post_name=sfsa-seed-a --post_title="How to speed up WordPress with caching" --post_content="<p>$BASE</p>"
$WP post create --post_status=publish --post_name=sfsa-seed-b --post_title="Speed up WordPress with caching" --post_content="<p>$BASE One more closing sentence.</p>"
$WP post create --post_status=publish --post_title="Baking sourdough bread at home" --post_content="<p>Mix flour, water and starter, rest the dough overnight, then bake in a hot dutch oven.</p>"
$WP post create --post_status=draft --post_title="Choosing a sourdough starter" --post_content="<p>A healthy starter doubles in size within hours of feeding.</p>"
