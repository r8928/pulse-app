import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SCOPES } from '../../constants/index.js';
import { NAVIGATION, visibleNavigation } from '../navigation.js';

/**
 * S-04 and the shell: "tiles render per permission; a viewer holding only
 * attendance read sees the snapshot and nothing else."
 *
 * Screens are shared, not per role — one screen per job, with controls
 * appearing or vanishing with the viewer's permissions. There is no IT user
 * list separate from an OFFICE_ADMIN one.
 */

const held = (...permissions) =>
  Object.fromEntries(permissions.map((p) => [p, SCOPES.ALL]));

describe('NAVIGATION', () => {
  it('covers all eight modules', () => {
    // Eight since the Attendance & Leaves merge retired the Reports module:
    // its columns are part of the attendance summary and its export is a
    // button on it, so a separate entry would be a second door to one room.
    expect(NAVIGATION).toHaveLength(8);
  });

  it('offers no Reports module, so there is one door to the report columns', () => {
    expect(NAVIGATION.map((item) => item.route)).not.toContain('/reports');
  });

  it('gives every item a route and a label', () => {
    for (const item of NAVIGATION) {
      expect(item.route).toMatch(/^\//);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});

describe('visibleNavigation', () => {
  it('always shows home, which every signed-in user reaches', () => {
    const routes = visibleNavigation({}).map((item) => item.route);
    expect(routes).toContain('/');
  });

  it('hides the exceptions dashboard from a viewer without the permission', () => {
    // FR-8.1 withholds it from EMPLOYEE explicitly.
    const routes = visibleNavigation(held(PERMISSIONS.ATTENDANCE_READ)).map(
      (item) => item.route,
    );
    expect(routes).not.toContain('/exceptions');
  });

  it('shows the exceptions dashboard to a viewer who holds it', () => {
    const routes = visibleNavigation(held(PERMISSIONS.EXCEPTIONS_READ)).map(
      (item) => item.route,
    );
    expect(routes).toContain('/exceptions');
  });

  it('shows attendance to a read-only viewer, since EMPLOYEE holds it at ALL', () => {
    const routes = visibleNavigation(held(PERMISSIONS.ATTENDANCE_READ)).map(
      (item) => item.route,
    );
    expect(routes).toContain('/attendance');
  });

  it('hides the report builder from a viewer holding only attendance read', () => {
    // FR-8.1: the S-09 read surface is granted to EMPLOYEE; the S-20 report
    // builder beside it deliberately is not.
    const routes = visibleNavigation(held(PERMISSIONS.ATTENDANCE_READ)).map(
      (item) => item.route,
    );
    expect(routes).not.toContain('/reports');
  });

  it('shows a viewer holding only attendance read exactly home and attendance', () => {
    const routes = visibleNavigation(held(PERMISSIONS.ATTENDANCE_READ)).map(
      (item) => item.route,
    );
    expect(routes).toEqual(['/', '/attendance']);
  });

  it('shows every module to a viewer holding every permission', () => {
    const everything = held(...Object.values(PERMISSIONS));
    expect(visibleNavigation(everything)).toHaveLength(NAVIGATION.length);
  });

  it('shows only home when the viewer holds nothing at all', () => {
    expect(visibleNavigation({}).map((item) => item.route)).toEqual(['/']);
  });

  it('treats a missing permissions map as holding nothing, not everything', () => {
    // Failing open here would expose every module the moment the map is
    // undefined for any reason (DC-6).
    expect(visibleNavigation(undefined).map((item) => item.route)).toEqual([
      '/',
    ]);
  });
});
