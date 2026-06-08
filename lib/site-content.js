const hero = {
  label: 'Private company · Los Angeles, CA',
  name: 'Understudy',
  tagline: 'A home for the businesses, projects, and systems Spencer is building.',
};

const manifesto = {
  number: '01',
  heading: 'One front door.\nMultiple businesses.\nLong-term ownership.',
  paragraphs: [
    'Understudy is the umbrella for a small group of businesses and working projects. It is meant to hold the public story together while leaving room for different lines of work to grow at their own pace.',
    'The public site should stay quiet and clear. The detailed structure can stay private until each business is ready to stand on its own.',
  ],
};

const structure = {
  label: '02 - Structure',
  title: 'Understudy is the parent layer. The businesses underneath can stay distinct.',
  items: [
    {
      name: 'Parent brand',
      description: 'Understudy is the shared front door, operating identity, and long-term umbrella.',
    },
    {
      name: 'Operating businesses',
      description: 'Revenue-producing businesses can live under Understudy without losing their own customers, workflows, or voice.',
    },
    {
      name: 'New ventures',
      description: 'Early concepts can stay lightweight until they prove demand, then become fuller businesses later.',
    },
    {
      name: 'Research and systems',
      description: 'The brain, scouting work, and internal tools support the whole portfolio rather than one project at a time.',
    },
  ],
};

const ventures = {
  label: '03 - Current lines',
  title: 'The site can show the shape of the portfolio without exposing every internal detail.',
  items: [
    {
      number: '01',
      name: 'Understudy Brain',
      status: 'Active',
      description: 'Internal operating system for research, memory, tasks, and daily scouting.',
    },
    {
      number: '02',
      name: 'Deal Hunter',
      status: 'Transitioning',
      description: 'Existing live site to fold under the Understudy umbrella instead of standing alone.',
    },
    {
      number: '03',
      name: 'Place-based business',
      status: 'In development',
      description: 'Hospitality or cultural work that can become its own durable business when timing is right.',
    },
    {
      number: '04',
      name: 'Studio experiments',
      status: 'Ongoing',
      description: 'Smaller software, research, and builder relationships that may grow into future companies.',
    },
  ],
};

const philosophy = {
  number: '04',
  quote: 'Understudy should feel like a steady home for good work, not a campaign for attention.',
  paragraphs: [
    'That means clear ownership, a small number of focused businesses, and enough patience for each one to develop its own identity.',
    'The website does not need to explain everything. It needs to make the structure legible, show that something real is being built, and give every future business a place to belong.',
  ],
  attribution: 'Spencer Lewis, Founder',
};

const footer = {
  type: 'Private company',
  location: 'Los Angeles, California',
  note: 'Privately held.',
};

module.exports = {
  hero,
  manifesto,
  structure,
  ventures,
  philosophy,
  footer,
};
