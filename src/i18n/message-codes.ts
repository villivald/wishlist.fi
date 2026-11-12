import type { TextKey } from "./text";

// Codes remain stable when presentation copy changes.
export const messageCodes = {
  "message.username_taken": "This username is taken. Choose another.",
  "message.username_length":
    "Use 2–40 letters, numbers, underscores, or hyphens.",
  "message.google_delete_confirmation":
    "Confirm with Google again before deleting your account.",
  "message.password_setup_sent":
    "If a new link can be sent, it will arrive at your account email. Use the latest link to set a password.",
  "message.delete_confirmation":
    "Confirm your identity, type DELETE, and refresh the deletion summary if needed.",
  "message.list_hidden_from_viewers": "List hidden from viewers.",
  "message.account_protection_is_temporarily_unavailable_please_try_again_shortly":
    "Account protection is temporarily unavailable. Please try again shortly.",
  "message.please_complete_the_security_check_and_try_again":
    "Please complete the security check and try again.",
  "message.please_wait_before_requesting_another_email_check_your_inbox_and_spam_folder":
    "Please wait before requesting another email. Check your inbox and spam folder.",
  "message.group_unavailable":
    "This group is unavailable or you no longer have access.",
  "message.group_disabled":
    "New group invitations and acceptance are disabled for this list.",
  "message.group_already_invited":
    "This person has already been invited to this reservation.",
  "message.group_full":
    "A group can include up to ten people, including pending invitations.",
  "message.group_transfer_required":
    "Transfer coordination before leaving, or cancel the reservation for everyone.",
  "message.group_consent_required":
    "Confirm that your name and username will be shared with this group.",
  "message.group_updated": "Group reservation updated.",

  "message.favorite_added": "Added to favorites.",
  "message.favorite_removed": "Removed from favorites.",
  "message.favorite_verify_email": "Verify your email to manage favorites.",
  "message.favorite_unavailable":
    "This item is unavailable or you no longer have access.",
  "message.a_new_code_has_been_sent_check_your_inbox":
    "A new code has been sent. Check your inbox.",
  "message.active_premium_access_is_required_for_this_action":
    "Active Premium access is required for this action.",
  "message.billing_changed_please_try_again":
    "Billing changed. Please try again.",
  "message.billing_is_still_updating_or_paddle_is_unavailable_please_try_again_shortly":
    "Billing is still updating or Paddle is unavailable. Please try again shortly.",
  "message.billing_is_updating_please_try_again_shortly":
    "Billing is updating. Please try again shortly.",
  "message.billing_updated_premium_is_added_once_payment_is_confirmed":
    "Billing updated. Premium is added once payment is confirmed.",
  "message.checkout_closure_requested_a_payment_already_processing_may_still_complete_refresh_billing_before_trying_again":
    "Checkout closure requested. A payment already processing may still complete; refresh billing before trying again.",
  "message.choose_a_currency_for_this_price":
    "Choose a currency for this price",
  "message.choose_a_valid_still_jpeg_png_or_webp_image_up_to_20_megapixels_and_8192_pixels_per_side":
    "Choose a valid, still JPEG, PNG, or WebP image up to 20 megapixels and 8192 pixels per side.",
  "message.choose_an_image_to_upload": "Choose an image to upload.",
  "message.choose_an_image_up_to_3_mb": "Choose an image up to 3 MB.",
  "message.choose_another_current_admin_as_the_new_owner":
    "Choose another current admin as the new owner.",
  "message.confirm_that_anyone_with_this_link_may_view_the_list_when_it_is_visible":
    "Confirm that anyone with this link may view the list when it is visible.",
  "message.confirm_that_you_want_to_delete_this_list":
    "Confirm that you want to delete this list.",
  "message.confirm_that_you_want_to_delete_this_wish":
    "Confirm that you want to delete this wish.",
  "message.confirm_the_recurring_subscription_terms":
    "Confirm the recurring subscription terms.",
  "message.confirm_this_change_before_continuing":
    "Confirm this change before continuing.",
  "message.email_delivery_failed": "Email delivery failed",
  "message.enter_a_full_http_or_https_link_without_login_details":
    "Enter a full HTTP or HTTPS link without login details",
  "message.enter_a_label": "Enter a label",
  "message.enter_a_title": "Enter a title",
  "message.enter_a_valid_price": "Enter a valid price",
  "message.enter_the_eight_letter_code": "Enter the eight-letter code",
  "message.enter_your_current_password": "Enter your current password",
  "message.enter_your_current_password_type_delete_and_refresh_the_deletion_summary_if_needed":
    "Enter your current password, type DELETE, and refresh the deletion summary if needed.",
  "message.finish_or_discard_your_existing_checkout_first":
    "Finish or discard your existing checkout first.",
  "message.guest_link_created_copy_it_now_it_will_not_be_shown_again":
    "Guest link created. Copy it now; it will not be shown again.",
  "message.if_an_account_matches_that_email_you_will_receive_a_reset_link":
    "If an account matches that email, you will receive a reset link.",
  "message.incorrect_current_password": "Incorrect current password",
  "message.incorrect_email_or_password": "Incorrect email or password",
  "message.invitation_created_delivery_status_is_shown_below":
    "Invitation created. Delivery status is shown below.",
  "message.only_the_owner_can_transfer_this_list":
    "Only the owner can transfer this list.",
  "message.paddle_could_not_complete_this_request_please_try_again_shortly":
    "Paddle could not complete this request. Please try again shortly.",
  "message.paddle_is_unavailable_please_try_again_shortly":
    "Paddle is unavailable. Please try again shortly.",
  "message.password_changed_your_other_sessions_have_been_signed_out":
    "Password changed. Your other sessions have been signed out.",
  "message.passwords_do_not_match": "Passwords do not match",
  "message.payment_period_is_not_available_yet":
    "Payment period is not available yet.",
  "message.please_sign_in_again": "Please sign in again",
  "message.profile_saved": "Profile saved.",
  "message.promo_code_redeemed_your_premium_access_has_been_updated":
    "Promo code redeemed. Your Premium access has been updated.",
  "message.refresh_the_deletion_summary": "Refresh the deletion summary",
  "message.reservation_revoked": "Reservation revoked.",
  "message.revoke_the_pending_invitation_before_creating_a_replacement":
    "Revoke the pending invitation before creating a replacement.",
  "message.role_updated": "Role updated.",
  "message.sign_in_with_a_verified_account_to_create_a_list":
    "Sign in with a verified account to create a list.",
  "message.sign_in_with_a_verified_account_to_manage_reservations":
    "Sign in with a verified account to manage reservations.",
  "message.something_went_wrong_please_try_again":
    "Something went wrong. Please try again.",
  "message.subscription_cancellation_is_still_pending":
    "Subscription cancellation is still pending.",
  "message.subscriptions_are_not_available_yet_you_can_still_use_a_promo_code":
    "Subscriptions are not available yet. You can still use a promo code.",
  "message.the_image_could_not_be_updated_check_your_connection_and_try_again":
    "The image could not be updated. Check your connection and try again.",
  "message.the_owner_cannot_leave_or_be_removed_transfer_ownership_first":
    "The owner cannot leave or be removed. Transfer ownership first.",
  "message.the_owner_s_admin_role_cannot_be_changed_transfer_ownership_first":
    "The owner's admin role cannot be changed. Transfer ownership first.",
  "message.the_subscription_price_is_not_configured_correctly_please_contact_support":
    "The subscription price is not configured correctly. Please contact support.",
  "message.the_upload_expired_please_try_again":
    "The upload expired. Please try again.",
  "message.this_account_is_unavailable": "This account is unavailable.",
  "message.this_billing_account_is_closing": "This billing account is closing.",
  "message.this_billing_email_is_already_associated_with_another_account_contact_support":
    "This billing email is already associated with another account. Contact support.",
  "message.this_checkout_is_processing_or_finished_refresh_billing_shortly":
    "This checkout is processing or finished. Refresh billing shortly.",
  "message.this_code_is_invalid_or_expired_request_a_new_code_and_try_again":
    "This code is invalid or expired. Request a new code and try again.",
  "message.this_list_is_unavailable_or_you_do_not_have_permission_to_change_it":
    "This list is unavailable or you do not have permission to change it.",
  "message.this_list_is_unavailable": "This list is unavailable.",
  "message.this_membership_is_unavailable": "This membership is unavailable.",
  "message.this_person_already_belongs_to_this_list":
    "This person already belongs to this list.",
  "message.this_reset_link_is_invalid_or_expired_request_a_new_link":
    "This reset link is invalid or expired. Request a new link.",
  "message.this_wish_can_no_longer_be_reserved_it_may_be_unavailable_already_reserved_or_have_reservations_disabled":
    "This wish can no longer be reserved. It may be unavailable, already reserved, or have reservations disabled.",
  "message.this_wish_could_not_be_reserved_refresh_the_page_and_try_again":
    "This wish could not be reserved. Refresh the page and try again.",
  "message.this_wish_is_unavailable_or_you_do_not_have_permission_to_change_it":
    "This wish is unavailable or you do not have permission to change it.",
  "message.this_wish_is_unavailable": "This wish is unavailable.",
  "message.too_many_attempts_please_try_again_later":
    "Too many attempts. Please try again later.",
  "message.type_delete_to_confirm": "Type DELETE to confirm",
  "message.unable_to_register_with_these_details_try_signing_in_or_recovering_your_password":
    "Unable to register with these details. Try signing in or recovering your password.",
  "message.unsupported_image": "Unsupported image",
  "message.use_a_link_no_longer_than_2_048_characters":
    "Use a link no longer than 2,048 characters",
  "message.use_a_non_negative_price_with_at_most_two_decimal_places":
    "Use a non-negative price with at most two decimal places.",
  "message.use_a_price_no_higher_than_21_474_836_47":
    "Use a price no higher than 21,474,836.47.",
  "message.use_at_least_12_characters": "Use at least 12 characters",
  "message.use_at_most_1_000_characters": "Use at most 1,000 characters",
  "message.use_at_most_128_characters": "Use at most 128 characters",
  "message.use_at_most_2_000_characters": "Use at most 2,000 characters",
  "message.use_at_most_200_characters": "Use at most 200 characters",
  "message.use_at_most_4_000_characters": "Use at most 4,000 characters",
  "message.use_at_most_80_characters": "Use at most 80 characters",
  "message.use_letters_numbers_underscores_or_hyphens":
    "Use letters, numbers, underscores, or hyphens",
  "message.visibility_updated_reservations_for_people_who_lost_access_have_ended":
    "Visibility updated. Reservations for people who lost access have ended.",
  "message.we_are_checking_your_previous_checkout_refresh_billing_shortly_do_not_start_another_payment":
    "We are checking your previous checkout. Refresh billing shortly; do not start another payment.",
  "message.wish_reserved_you_can_find_it_in_my_reservations":
    "Wish reserved. You can find it in My reservations.",
  "message.wish_updated": "Wish updated.",
  "message.you_already_have_a_subscription_use_manage_subscription":
    "You already have a subscription. Use Manage subscription.",
  "message.you_do_not_have_permission_to_manage_this_list":
    "You do not have permission to manage this list.",
  "message.you_have_already_redeemed_this_promo_code":
    "You have already redeemed this promo code.",
  "message.your_email_is_already_verified": "Your email is already verified.",
  "message.your_lists_or_reservations_changed_refresh_this_page_and_review_the_updated_summary_before_deleting":
    "Your lists or reservations changed. Refresh this page and review the updated summary before deleting.",
  "message.your_paid_period_is_still_active_subscribe_again_after_it_ends":
    "Your paid period is still active. Subscribe again after it ends.",
  "message.your_password_changed_please_sign_in_again":
    "Your password changed. Please sign in again.",
  "message.your_session_expired_please_sign_in_again":
    "Your session expired. Please sign in again.",
} as const satisfies Record<string, TextKey>;

export type MessageCode = keyof typeof messageCodes;
const codesByText = new Map<string, MessageCode>(
  Object.entries(messageCodes).map(([code, text]) => [
    text,
    code as MessageCode,
  ]),
);
export const messageCode = (text: string) => codesByText.get(text);
