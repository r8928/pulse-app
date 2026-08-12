import LoginOutlined from '@mui/icons-material/LoginOutlined';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { signIn } from '../../auth.js';
import { SIGNIN_REJECTION } from '../../constants/index.js';

/**
 * S-01. The only unauthenticated screen.
 *
 * FR-1.5 requires five distinct rejection messages rather than one generic
 * failure. Each names what is wrong and who can fix it, because "sign in
 * failed" leaves both the person and the administrator helping them with
 * nowhere to go.
 */
const REJECTIONS = {
  [SIGNIN_REJECTION.UNAUTHORISED_DOMAIN]: {
    title: 'That account is not on an authorised domain',
    detail:
      'Sign in with your company Google account. Personal accounts and outside domains cannot be used. An office administrator can add a domain in Settings.',
  },
  [SIGNIN_REJECTION.NO_MATCHING_USER]: {
    title: 'No Pulse user holds that work email',
    detail:
      'Your Google account is valid but no user record carries this address. Ask IT to create your user, or to add the work email to your existing record.',
  },
  [SIGNIN_REJECTION.USER_SOFT_DELETED]: {
    title: 'That user is no longer active',
    detail:
      'The record has been removed. Your history is kept in full and access returns if IT restores you.',
  },
  [SIGNIN_REJECTION.LOGIN_DISABLED]: {
    title: 'Sign in is disabled for that user',
    detail:
      'The user exists and the work email is correct, but login is switched off. Ask IT to enable it.',
  },
  [SIGNIN_REJECTION.OUTSIDE_EMPLOYMENT_PERIOD]: {
    title: "Today falls outside that user's employment period",
    detail:
      'The record exists but today is not inside any period of employment on it — before a start date, after a leaving date, or in a gap between two. Ask IT to check the dates.',
  },
  SESSION_NO_LONGER_VALID: {
    title: 'Your session is no longer valid',
    detail:
      'Your access changed while you were signed in. Sign in again to continue.',
  },
  NO_EMAIL_ON_PROFILE: {
    title: 'Google did not return an email address',
    detail:
      'Pulse matches users by work email, so it cannot identify an account without one.',
  },
};

export default async function SignInPage({ searchParams }) {
  const params = await searchParams;
  const rejection = params?.reason ? REJECTIONS[params.reason] : null;

  async function startGoogleSignIn() {
    'use server';
    await signIn('google', { redirectTo: params?.from ?? '/' });
  }

  return (
    <Stack
      sx={{
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Paper variant='outlined' sx={{ maxWidth: 460, width: '100%' }}>
        <Stack spacing={3} sx={{ p: 4 }}>
          <Stack spacing={1}>
            <Typography variant='pageTitle'>Pulse</Typography>
            <Typography variant='body2' color='text.secondary'>
              Attendance, leave, PTO and CTO. Sign in with your company Google
              account.
            </Typography>
          </Stack>

          {rejection ? (
            <Alert severity='error'>
              <AlertTitle>{rejection.title}</AlertTitle>
              {rejection.detail}
            </Alert>
          ) : null}

          <form action={startGoogleSignIn}>
            <Button
              type='submit'
              variant='contained'
              fullWidth
              startIcon={<LoginOutlined />}
            >
              Continue with Google
            </Button>
          </form>

          <Typography variant='body2' color='text.secondary'>
            Pulse stores no password. Authentication is handled entirely by
            Google.
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}
