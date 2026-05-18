<?php
/**
 * Paratus Group Dashboards — Elementor → /api/leads/ingest bridge
 * ---------------------------------------------------------------------------
 * INSTALL: paste the body of this file (everything below the marker) into a
 *          NEW snippet in the WordPress "Code Snippets" plugin on
 *          paratus.africa. Scope: "Run everywhere". Do NOT edit any existing
 *          snippet. Do NOT touch any form's "Actions After Submit".
 *
 * WHAT IT DOES: hooks Elementor Pro's server-side `new_record` event (fires
 *   after a successful form submit, independent of every Action After Submit),
 *   reshapes the submission into the dashboard's ingest contract, signs it with
 *   HMAC-SHA256, and POSTs it to https://dashboards.paratus.africa/api/leads/ingest.
 *
 *   It is purely additive: Paratus's existing Email / Collect Submissions /
 *   Webhook / Popup actions are never read, modified, or removed. If this code
 *   errors it swallows the error — a form submission can never be broken by it.
 *
 * SECRET: the real PARATUS_INGEST_SECRET value is NOT in this repo file. Paste
 *   the live value into the snippet in WordPress only (or define it in
 *   wp-config.php as PARATUS_INGEST_SECRET, which this code prefers if present).
 *   It must byte-match the PARATUS_INGEST_SECRET env var on Vercel.
 *
 * PILOT: while PARATUS_PILOT_FORM_IDS is non-empty, only those form IDs are
 *   actually sent (others are logged and skipped) — used to validate on the
 *   /form-test form (727b039) before going live on all 8.
 * ---------------------------------------------------------------------------
 */

/* ============================ SNIPPET BODY ============================ */

add_action( 'elementor_pro/forms/new_record', function ( $record, $handler ) {

	try {
		// --- config -------------------------------------------------------
		$endpoint = 'https://dashboards.paratus.africa/api/leads/ingest';

		$secret = defined( 'PARATUS_INGEST_SECRET' )
			? PARATUS_INGEST_SECRET
			: 'PASTE_REAL_SECRET_HERE_IN_WORDPRESS_ONLY';

		// During pilot keep this = array( '727b039' ). Set to array() to go
		// live on every in-scope form.
		$pilot_only = array( '727b039' );

		// form_id => fixed slug. Reused IDs (resolved by referrer) are absent
		// here and handled in slug_from_referrer().
		$slug_by_form = array(
			'e9ad77c' => 'general-contact',
			'06095a5' => 'general-contact',
			'727b039' => 'general-contact',
			'1449b78' => 'data-centers',
			'0613ec5' => 'satellite',
			// reused — slug comes from referrer:
			'cda1b37' => null,
			'2c5fd13' => null,
			'ec2bdd9' => null,
		);

		$form_id = (string) $record->get_form_settings( 'id' );

		// Hard guard: only the 8 in-scope forms. Everything else (incl. the
		// out-of-scope 71e30c8 / 4216a7c / 897e124) returns immediately.
		if ( ! array_key_exists( $form_id, $slug_by_form ) ) {
			return;
		}

		// --- gather raw inputs -------------------------------------------
		$fields = array();
		foreach ( (array) $record->get( 'fields' ) as $id => $f ) {
			$fields[ $id ] = array(
				'type'  => isset( $f['type'] ) ? $f['type'] : '',
				'title' => isset( $f['title'] ) ? $f['title'] : '',
				'value' => isset( $f['value'] ) ? $f['value'] : '',
			);
		}

		$page_url = '';
		$meta = (array) $record->get( 'meta' );
		if ( ! empty( $meta['page_url']['value'] ) ) {
			$page_url = $meta['page_url']['value'];
		}
		if ( ! $page_url && ! empty( $_POST['referrer'] ) ) {
			$page_url = esc_url_raw( wp_unslash( $_POST['referrer'] ) );
		}
		if ( ! $page_url ) {
			$page_url = wp_get_referer() ?: '';
		}
		$path = strtolower( (string) wp_parse_url( $page_url, PHP_URL_PATH ) );

		// --- resolve form_slug -------------------------------------------
		$slug = $slug_by_form[ $form_id ];
		if ( $slug === null ) {
			$slug = paratus_slug_from_referrer( $form_id, $path );
		}
		if ( ! $slug ) {
			error_log( "[paratus-ingest] no slug for form {$form_id} path {$path} — skipped" );
			return;
		}

		// --- detect contact fields by type/title -------------------------
		$name = $email = $phone = $message = '';
		foreach ( $fields as $f ) {
			$t   = $f['type'];
			$ttl = strtolower( $f['title'] );
			$val = is_array( $f['value'] ) ? implode( ', ', $f['value'] ) : trim( (string) $f['value'] );
			if ( $val === '' ) {
				continue;
			}
			if ( ! $email && $t === 'email' ) {
				$email = $val;
			} elseif ( ! $phone && ( $t === 'tel' || ( strpos( $ttl, 'phone' ) !== false && strpos( $ttl, 'code' ) === false ) ) ) {
				$phone = $val;
			} elseif ( ! $message && ( $t === 'textarea' || strpos( $ttl, 'message' ) !== false ) ) {
				$message = $val;
			} elseif ( ! $name && strpos( $ttl, 'name' ) !== false
				&& strpos( $ttl, 'company' ) === false
				&& strpos( $ttl, 'organis' ) === false ) {
				$name = $val;
			}
		}

		// Schema requires name + (email OR phone). Don't drop — log so a
		// malformed form definition is visible, but a real contactless
		// submission can't become a lead anyway.
		if ( $name === '' || ( $email === '' && $phone === '' ) ) {
			error_log( "[paratus-ingest] form {$form_id}: missing name/email/phone — skipped" );
			return;
		}

		// --- resolve country_code ----------------------------------------
		$country = paratus_country_from_fields( $fields );
		if ( ! $country ) {
			$country = paratus_country_from_path( $path );
		}
		if ( ! $country ) {
			$country = 'HQ';
		}

		// --- build payload (matches ingestSchema verbatim) ---------------
		$payload = array(
			'form_slug'    => $slug,
			'country_code' => $country,
			'submitted_at' => gmdate( 'Y-m-d\TH:i:s\Z' ),
			'name'         => mb_substr( $name, 0, 200 ),
			'email'        => $email !== '' ? $email : null,
			'phone'        => $phone !== '' ? mb_substr( $phone, 0, 40 ) : null,
			'message'      => $message !== '' ? mb_substr( $message, 0, 5000 ) : null,
			'source_url'   => $page_url !== '' ? $page_url : null,
			'utm_source'   => paratus_qs( $page_url, 'utm_source' ),
			'utm_medium'   => paratus_qs( $page_url, 'utm_medium' ),
			'utm_campaign' => paratus_qs( $page_url, 'utm_campaign' ),
			'raw_payload'  => array_map(
				function ( $f ) { return is_array( $f['value'] ) ? implode( ', ', $f['value'] ) : (string) $f['value']; },
				$fields
			),
		);

		$json = wp_json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		$sig  = hash_hmac( 'sha256', $json, $secret );

		// Pilot gate — log but don't send for non-pilot forms while piloting.
		if ( ! empty( $pilot_only ) && ! in_array( $form_id, $pilot_only, true ) ) {
			error_log( "[paratus-ingest] pilot mode: form {$form_id} ({$slug}/{$country}) prepared, not sent" );
			return;
		}

		$res = wp_remote_post( $endpoint, array(
			'timeout'  => 6,
			'blocking' => true,
			'headers'  => array(
				'Content-Type'        => 'application/json',
				'x-paratus-signature' => $sig,
			),
			'body'     => $json,
		) );

		if ( is_wp_error( $res ) ) {
			error_log( '[paratus-ingest] POST failed: ' . $res->get_error_message() . ' payload=' . $json );
			return;
		}
		$code = wp_remote_retrieve_response_code( $res );
		if ( $code !== 200 && $code !== 201 ) {
			error_log( "[paratus-ingest] endpoint {$code}: " . wp_remote_retrieve_body( $res ) . ' payload=' . $json );
		}
	} catch ( \Throwable $e ) {
		// Never let this break a form submission.
		error_log( '[paratus-ingest] exception: ' . $e->getMessage() );
	}
}, 10, 2 );

/* --------------------------- helpers --------------------------- */

function paratus_slug_from_referrer( $form_id, $path ) {
	$map = array(
		'cda1b37' => array( 'starlink' => 'starlink', 'oneweb' => 'oneweb', 'carrier' => 'carrier-services' ),
		'2c5fd13' => array( 'starlink-for-schools' => 'starlink-for-schools', 'starlink-for-clinics' => 'connect2care', 'essential-access' => 'essential-access' ),
		'ec2bdd9' => array( 'broadband' => 'broadband', 'data-center' => 'data-centers', 'satellite' => 'satellite' ),
	);
	if ( empty( $map[ $form_id ] ) ) {
		return '';
	}
	foreach ( $map[ $form_id ] as $needle => $slug ) {
		if ( strpos( $path, $needle ) !== false ) {
			return $slug;
		}
	}
	return ''; // unknown page for a reused form — caller logs + skips.
}

function paratus_country_from_fields( $fields ) {
	$valid = array( 'AO','BW','CD','SZ','KE','MZ','NA','RW','ZA','TZ','UG','ZM','LS','MW','ZW' );
	foreach ( $fields as $f ) {
		$ttl = strtolower( $f['title'] );
		if ( strpos( $ttl, 'country' ) === false && strpos( $ttl, 'group site' ) === false ) {
			continue;
		}
		$val = strtolower( is_array( $f['value'] ) ? reset( $f['value'] ) : (string) $f['value'] );
		if ( strpos( $val, '@' ) === false ) {
			continue; // not the recipient-email style dropdown
		}
		// info.xx@ / starlink.xx@ / sales.xx@ paratus.africa
		if ( preg_match( '/(?:info|starlink|sales)\.([a-z]{2})@paratus\.africa/', $val, $m ) ) {
			$c = strtoupper( $m[1] );
			if ( in_array( $c, $valid, true ) ) {
				return $c;
			}
		}
		// country-specific domains
		$domains = array(
			'paratus.ke'     => 'KE',
			'paratus.co.rw'  => 'RW',
			'paratus.co.sz'  => 'SZ',
			'fast-congo.cd'  => 'CD',
		);
		foreach ( $domains as $d => $c ) {
			if ( strpos( $val, '@' . $d ) !== false || substr( $val, -strlen( $d ) ) === $d ) {
				return $c;
			}
		}
		// info@paratus.africa / sales@paratus.africa / blank → fall through
	}
	return '';
}

function paratus_country_from_path( $path ) {
	$names = array(
		'angola' => 'AO', 'botswana' => 'BW', 'drc' => 'CD', 'congo' => 'CD',
		'eswatini' => 'SZ', 'kenya' => 'KE', 'mozambique' => 'MZ',
		'namibia' => 'NA', 'rwanda' => 'RW', 'south-africa' => 'ZA',
		'southafrica' => 'ZA', 'tanzania' => 'TZ', 'uganda' => 'UG',
		'zambia' => 'ZM', 'lesotho' => 'LS', 'malawi' => 'MW', 'zimbabwe' => 'ZW',
	);
	foreach ( $names as $needle => $code ) {
		if ( strpos( $path, '/' . $needle ) !== false ) {
			return $code;
		}
	}
	return '';
}

function paratus_qs( $url, $key ) {
	$q = (string) wp_parse_url( $url, PHP_URL_QUERY );
	if ( ! $q ) {
		return null;
	}
	parse_str( $q, $a );
	return isset( $a[ $key ] ) && $a[ $key ] !== '' ? mb_substr( $a[ $key ], 0, 120 ) : null;
}
