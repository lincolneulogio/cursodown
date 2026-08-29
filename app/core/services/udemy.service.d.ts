export interface UdemyProfile {
	id?: string | number;
	display_name?: string;
	title?: string;
	name?: string;
	email?: string;
	image_50x50?: string;
	image_100x100?: string;
	[key: string]: unknown;
}

export interface UdemyCoursesPage {
	count?: number;
	next?: string | null;
	previous?: string | null;
	results?: unknown[];
	[key: string]: unknown;
}

declare class UdemyService {
	constructor(subDomain?: string, httpTimeout?: number);
	readonly urlBase: string;
	setAuth(accessToken: string, clientId?: string | null): Record<string, string>;
	fetchLoadMore(url: string, httpTimeout?: number): Promise<UdemyCoursesPage>;
	fetchProfile(accessToken: string, httpTimeout?: number, clientId?: string | null): Promise<UdemyProfile>;
	fetchSearchCourses(
		keyword: string,
		pageSize: number,
		isSubscriber: boolean,
		httpTimeout?: number
	): Promise<UdemyCoursesPage>;
	fetchCourses(pageSize?: number, isSubscriber?: boolean, httpTimeout?: number): Promise<UdemyCoursesPage>;
	fetchCourse(courseId: string | number, httpTimeout?: number): Promise<unknown>;
	fetchLecture(
		courseId: string | number,
		lectureId: string | number,
		getAttachments: boolean,
		allAssets?: boolean,
		httpTimeout?: number
	): Promise<any>;
	fetchLectureAttachments(lectureId: string | number, httpTimeout?: number): Promise<any>;
	fetchCourseContent(courseId: string | number, contentType: string, httpTimeout?: number): Promise<any>;
}

export = UdemyService;
